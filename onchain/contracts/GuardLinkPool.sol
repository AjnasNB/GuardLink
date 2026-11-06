// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/*
 * GuardLink demo: centralized bootstrap verification/panel assignment; no randomness,
 * Sybil resistance, anonymity, AI authority, admin withdrawal or upgrade authority.
 * Build target: solc 0.8.28, Cancun, optimizer 200 (project foundry.toml).
 * Decisions left open by the product specification:
 * - Covered incidents are in inclusive [start,end]; submission grace is 30 days
 *   after end, inclusive. Claimant must still be a verified member at submission.
 * - Each assigned panel has 72h to vote; voting is strictly before the deadline.
 *   Unassigned claims/appeals also expire after 72h, preventing indefinite locks.
 *   First assignment starts a fresh 72h; replacement before any ballot does not
 *   extend that deadline. No assignment/replacement after the current deadline.
 * - Two identical positive approval amounts resolve; two rejects resolve (reject
 *   amounts must be zero). Three divergent ballots are Unresolved, not rejected.
 * - Rejection permits one appeal strictly before resolution+72h. Requested
 *   exposure remains reserved until that window closes, or an appeal is rejected
 *   or expires unresolved. Anyone then calls releaseExposure. Unresolved original
 *   panels release only at their deadline. Unresolved decisions are not appealable.
 * - Approval releases requested-minus-approved immediately. Approved/paid amounts
 *   permanently consume policy.used. Payout obligations are tracked separately.
 * - Governance quorum = ceil(snapshot eligible / 2); support = ceil(2 * votes
 *   cast / 3), NOT two-thirds of the snapshot. Voting lasts 72h. Monotonic
 *   verification epochs snapshot membership even for changes in the same block;
 *   lookup is logarithmic, execution constant-time. Revocation is prospective.
 * - Treasury transfers are one-off proposals, capped both when proposed and
 *   executed at floor(10% of free treasury). Free treasury excludes ALL reserved
 *   open-claim exposure and committed approved payouts. No loop over claims.
 * - setClaimContact(bytes32,address) adds optional claim contact input:
 *   submitClaim cannot encode a contact. Contact is optional, publicly recorded,
 *   and frozen on the first original jury assignment.
 * - Bootstrap admin cannot verify itself. It has only verification and panel
 *   assignment privileges; an assigned juror's eligibility is frozen at selection.
 * Claim IDs: API UUID -> keccak256(bytes(uuid)) = clientId -> canonical claimId
 * = keccak256(abi.encode(claimant, clientId)). submitClaim returns this canonical
 * ID; all claim storage, getters, subsequent actions and claim events use it.
 * ClaimSubmitted additionally records clientId. No raw medical information belongs
 * in commitments, proposal descriptions, or events. ERC721s are mint-only.
 */
/// @title GuardLinkPool
/// @notice Cooperative demo pool; public records are pseudonymous, not anonymous.
contract GuardLinkPool is ERC721, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error Unauthorized();
    error InvalidInput();
    error InvalidState();
    error MissingRecord();
    error DeadlinePassed();
    error TooEarly();
    error AlreadyVoted();
    error InvalidJury();
    error CoverageExceeded();
    error InsufficientFunds();
    error ProposalNotPassed();
    error Nontransferable();
    error UnexpectedTokenAmount();

    uint64 public constant VOTING_PERIOD = 72 hours;
    uint64 public constant APPEAL_WINDOW = 72 hours;
    uint64 public constant SUBMISSION_GRACE = 30 days;

    /// @dev ABI uint8: 0 None, 1 Submitted, 2 Voting, 3 Approved, 4 Rejected,
    /// 5 Unresolved, 6 Appealed (awaiting panel), 7 AppealVoting, 8 Paid.
    enum Status { None, Submitted, Voting, Approved, Rejected, Unresolved, Appealed, AppealVoting, Paid }
    /// @dev ABI uint8: 0 Rules, 1 TreasuryTransfer.
    enum ProposalKind { Rules, TreasuryTransfer }

    struct Policy {
        address member;
        uint64 start;
        uint64 end;
        uint128 limit;
        uint128 used;
    }

    /// @notice Flat ABI tuple. deadline refers to the current round; hashes bind
    /// recorded ballots, including rationale hashes. Read getBallot for each ballot.
    struct Claim {
        address claimant;
        uint256 policyId;
        uint128 requestedAmount;
        uint128 approvedAmount;
        Status status;
        bool paid;
        bool appealed;
        uint64 deadline;
        address contact;
        bytes32 evidenceCommitment;
        bytes32 ballotCommitment;
        bytes32 appealBallotCommitment;
        uint64 incidentAt;
        uint64 resolvedAt;
        uint64 appealDeadline;
        bool exposureReleased;
    }

    struct Ballot {
        uint128 amount;
        bool cast;
        bool approve;
        bytes32 rationaleHash;
    }

    struct Round {
        address[3] jurors;
        Ballot[3] ballots;
        uint8 count;
    }

    struct VerificationCheckpoint {
        uint64 epoch;
        bool verified;
    }

    struct Proposal {
        address proposer;
        ProposalKind kind;
        bool executed;
        uint64 snapshotEpoch;
        uint64 deadline;
        uint128 contribution;
        uint128 limit;
        uint32 term;
        address recipient;
        uint128 amount;
        uint256 eligibleCount;
        uint256 yesVotes;
        uint256 noVotes;
        bytes32 descriptionHash;
    }

    address public immutable admin;
    address public immutable deploymentSigner;
    IERC20 public immutable token;
    uint128 public contributionAmount;
    uint128 public coverageLimit;
    uint32 public termDays;
    uint256 public nextPolicyId = 1;
    uint256 public nextProposalId = 1;
    uint64 public verificationEpoch;
    uint256 public verifiedMemberCount;
    uint256 public committedPayouts;
    /// @notice Requested exposure of unresolved, pending or appealable claims;
    /// excludes Approved/Paid claims, whose unpaid portion is committedPayouts.
    uint256 public openClaimExposure;

    mapping(address => bool) public members;
    mapping(address => bool) public verifiedMembers;
    mapping(uint256 => Policy) public policies;
    mapping(bytes32 => Claim) private _claims;
    mapping(bytes32 => Round) private _originalRounds;
    mapping(bytes32 => Round) private _appealRounds;
    mapping(address => VerificationCheckpoint[]) private _verificationHistory;
    mapping(uint256 => Proposal) private _proposals;
    mapping(uint256 => mapping(address => bool)) public proposalVoted;

    event PoolDeployed(address indexed admin, address indexed deploymentSigner, address indexed token,
        uint128 contribution, uint128 coverage, uint32 termDays);
    event MemberJoined(address indexed member);
    event MemberVerified(address indexed member, bool verified, uint64 epoch);
    event Contribution(address indexed member, uint256 indexed policyId, uint128 amount);
    event PolicyIssued(uint256 indexed policyId, address indexed member, uint64 start, uint64 end, uint128 limit);
    event ClaimSubmitted(bytes32 indexed claimId, bytes32 clientId, address indexed claimant, uint256 indexed policyId,
        uint128 requestedAmount, uint64 incidentAt, bytes32 evidenceCommitment);
    event ClaimContactSet(bytes32 indexed claimId, address indexed contact);
    event JuryAssigned(bytes32 indexed claimId, bool indexed appealRound, address[3] jurors, uint64 deadline);
    event BallotCast(bytes32 indexed claimId, address indexed juror, bool indexed appealRound,
        bool approve, uint128 amount, bytes32 rationaleHash);
    event ClaimApproved(bytes32 indexed claimId, uint128 amount, bool appealRound);
    event ClaimRejected(bytes32 indexed claimId, uint128 requestedAmount, bool appealRound, uint64 appealDeadline);
    event ClaimUnresolved(bytes32 indexed claimId, uint128 requestedAmount, bool appealRound);
    event ClaimPaid(bytes32 indexed claimId, address indexed claimant, uint128 amount);
    event ClaimAppealed(bytes32 indexed claimId, address indexed claimant, uint128 requestedAmount);
    event ExposureReleased(bytes32 indexed claimId, uint256 indexed policyId, uint128 amount);
    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, ProposalKind kind,
        uint64 snapshotEpoch, uint256 eligibleCount, uint64 deadline, string description);
    event RulesProposed(uint256 indexed proposalId, uint128 contribution, uint128 limit, uint32 termDays);
    event TreasuryTransferProposed(uint256 indexed proposalId, address indexed recipient, uint128 amount);
    event ProposalVote(uint256 indexed proposalId, address indexed voter, bool support);
    event ProposalExecuted(uint256 indexed proposalId, ProposalKind kind);
    event RulesUpdated(uint256 indexed proposalId, uint128 contribution, uint128 limit, uint32 termDays);
    event TreasuryTransferred(uint256 indexed proposalId, address indexed recipient, uint128 amount);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    constructor(address admin_, address token_, uint128 contribution, uint128 coverage, uint32 termDays_)
        ERC721("GuardLinkPool", "GLP")
    {
        if (admin_ == address(0) || token_ == address(0) || token_.code.length == 0) revert InvalidInput();
        _validateRules(contribution, coverage, termDays_);
        admin = admin_;
        deploymentSigner = msg.sender;
        token = IERC20(token_);
        contributionAmount = contribution;
        coverageLimit = coverage;
        termDays = termDays_;
        emit PoolDeployed(admin_, msg.sender, token_, contribution, coverage, termDays_);
    }

    function join() external {
        if (members[msg.sender]) revert InvalidState();
        members[msg.sender] = true;
        emit MemberJoined(msg.sender);
    }

    /// @notice Admin-only eligibility, no self-verification, no member bypass.
    /// Verification changes affect future proposals, not existing snapshots/panels.
    function verifyMember(address member, bool verified) external onlyAdmin {
        if (member == msg.sender || !members[member] || member == address(0)) revert InvalidInput();
        if (verifiedMembers[member] == verified) revert InvalidState();
        verifiedMembers[member] = verified;
        if (verified) ++verifiedMemberCount;
        else --verifiedMemberCount;
        uint64 epoch = ++verificationEpoch;
        _verificationHistory[member].push(VerificationCheckpoint(epoch, verified));
        emit MemberVerified(member, verified, epoch);
    }

    /// @notice Pays current contribution and mints immutable prospective terms.
    function contribute() external nonReentrant returns (uint256 policyId) {
        _requireVerified(msg.sender);
        uint128 contribution = contributionAmount;
        uint128 limit = coverageLimit;
        uint64 start = uint64(block.timestamp);
        uint64 end = uint64(block.timestamp + uint256(termDays) * 1 days);
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), contribution);
        if (token.balanceOf(address(this)) != beforeBalance + contribution) revert UnexpectedTokenAmount();
        policyId = nextPolicyId++;
        policies[policyId] = Policy(msg.sender, start, end, limit, 0);
        _safeMint(msg.sender, policyId);
        emit Contribution(msg.sender, policyId, contribution);
        emit PolicyIssued(policyId, msg.sender, start, end, limit);
    }

    /// @notice Returns the claimant-scoped canonical claim ID.
    /// @dev API UUID -> keccak256(bytes(uuid)) = clientId -> canonical claimId
    /// = keccak256(abi.encode(claimant, clientId)). All claim lookups/actions use
    /// the canonical ID, not clientId; another claimant has a separate namespace.
    function computeClaimId(address claimant, bytes32 clientId) public pure returns (bytes32) {
        return keccak256(abi.encode(claimant, clientId));
    }

    /// @notice Inclusive covered incident interval, and 30-day post-end grace.
    /// Reserves requestedAmount in policy.used even while rejected but appealable.
    /// @param clientId Client nonce: keccak256(bytes(uuid)) of the API UUID.
    /// @return claimId Canonical ID: keccak256(abi.encode(msg.sender, clientId)).
    /// @dev Reusing a clientId for the same claimant reverts; other claimants
    /// cannot reserve that claimant's ID. All subsequent actions use claimId.
    function submitClaim(bytes32 clientId, uint256 policyId, uint128 requestedAmount,
        uint64 incidentAt, bytes32 evidenceCommitment) external returns (bytes32 claimId)
    {
        _requireVerified(msg.sender);
        claimId = computeClaimId(msg.sender, clientId);
        if (_claims[claimId].claimant != address(0)) revert InvalidInput();
        Policy storage p = policies[policyId];
        if (p.member != msg.sender) revert Unauthorized();
        if (requestedAmount == 0 || requestedAmount > p.limit - p.used) revert CoverageExceeded();
        if (incidentAt < p.start || incidentAt > p.end || incidentAt > block.timestamp
            || block.timestamp > uint256(p.end) + SUBMISSION_GRACE) revert InvalidInput();
        p.used += requestedAmount;
        openClaimExposure += requestedAmount;
        Claim storage c = _claims[claimId];
        c.claimant = msg.sender;
        c.policyId = policyId;
        c.requestedAmount = requestedAmount;
        c.status = Status.Submitted;
        c.deadline = uint64(block.timestamp + VOTING_PERIOD);
        c.incidentAt = incidentAt;
        c.evidenceCommitment = evidenceCommitment;
        emit ClaimSubmitted(claimId, clientId, msg.sender, policyId, requestedAmount, incidentAt, evidenceCommitment);
    }

    /// @notice Declare optional contact using the canonical claimId before
    /// first jury assignment. submitClaim does not encode a contact.
    function setClaimContact(bytes32 claimId, address contact) external {
        Claim storage c = _claim(claimId);
        if (msg.sender != c.claimant) revert Unauthorized();
        if (c.status != Status.Submitted || block.timestamp >= c.deadline) revert InvalidState();
        c.contact = contact;
        emit ClaimContactSet(claimId, contact);
    }

    /// @notice Centralized demo roster. First assignment starts 72h; replacement
    /// before any ballot keeps the same deadline. Expired rounds cannot restart.
    function assignJury(bytes32 claimId, address[3] calldata jurors) external onlyAdmin {
        _assign(claimId, jurors, false);
    }

    /// @notice Same 72h rule as original assignment; reviewers must be disjoint.
    function assignAppealJury(bytes32 claimId, address[3] calldata jurors) external onlyAdmin {
        _assign(claimId, jurors, true);
    }

    function _assign(bytes32 claimId, address[3] calldata jurors, bool appealRound) private {
        Claim storage c = _claim(claimId);
        Status waiting = appealRound ? Status.Appealed : Status.Submitted;
        Status voting = appealRound ? Status.AppealVoting : Status.Voting;
        if (c.status != waiting && c.status != voting) revert InvalidState();
        if (block.timestamp >= c.deadline) revert DeadlinePassed();
        Round storage r = appealRound ? _appealRounds[claimId] : _originalRounds[claimId];
        if (r.count != 0) revert InvalidState();
        for (uint256 i; i < 3; ++i) {
            address juror = jurors[i];
            if (juror == address(0) || juror == c.claimant || juror == c.contact
                || !verifiedMembers[juror]) revert InvalidJury();
            for (uint256 j; j < i; ++j) {
                if (jurors[j] == juror) revert InvalidJury();
            }
            if (appealRound) {
                for (uint256 j; j < 3; ++j) {
                    if (_originalRounds[claimId].jurors[j] == juror) revert InvalidJury();
                }
            }
        }
        if (c.status == waiting) c.deadline = uint64(block.timestamp + VOTING_PERIOD);
        r.jurors = jurors;
        c.status = voting;
        emit JuryAssigned(claimId, appealRound, jurors, c.deadline);
    }

    function vote(bytes32 claimId, bool approve_, uint128 amount, bytes32 rationaleHash) external {
        _vote(claimId, approve_, amount, rationaleHash, false);
    }

    function appealVote(bytes32 claimId, bool approve_, uint128 amount, bytes32 rationaleHash) external {
        _vote(claimId, approve_, amount, rationaleHash, true);
    }

    /// @dev Rejection amounts are canonical zero. Positive approvals combine
    /// only with the exact same amount; no averaging, majority of amounts or AI.
    function _vote(bytes32 claimId, bool approve_, uint128 amount, bytes32 rationaleHash,
        bool appealRound) private
    {
        Claim storage c = _claim(claimId);
        if (c.status != (appealRound ? Status.AppealVoting : Status.Voting)) revert InvalidState();
        if (block.timestamp >= c.deadline) revert DeadlinePassed();
        if (approve_ ? (amount == 0 || amount > c.requestedAmount) : amount != 0) revert InvalidInput();
        Round storage r = appealRound ? _appealRounds[claimId] : _originalRounds[claimId];
        uint256 index = 3;
        for (uint256 i; i < 3; ++i) {
            if (r.jurors[i] == msg.sender) index = i;
        }
        if (index == 3) revert Unauthorized();
        if (r.ballots[index].cast) revert AlreadyVoted();
        r.ballots[index] = Ballot(amount, true, approve_, rationaleHash);
        ++r.count;
        bytes32 previous = appealRound ? c.appealBallotCommitment : c.ballotCommitment;
        bytes32 commitment = keccak256(abi.encode(previous, claimId, msg.sender, approve_, amount, rationaleHash));
        if (appealRound) c.appealBallotCommitment = commitment;
        else c.ballotCommitment = commitment;
        emit BallotCast(claimId, msg.sender, appealRound, approve_, amount, rationaleHash);
        for (uint256 i; i < 3; ++i) {
            Ballot storage b = r.ballots[i];
            if (i != index && b.cast && b.approve == approve_ && b.amount == amount) {
                _resolve(claimId, c, approve_, amount, appealRound);
                return;
            }
        }
        if (r.count == 3) {
            c.status = Status.Unresolved;
            c.resolvedAt = uint64(block.timestamp);
            emit ClaimUnresolved(claimId, c.requestedAmount, appealRound);
        }
    }

    function _resolve(bytes32 claimId, Claim storage c, bool approved, uint128 amount,
        bool appealRound) private
    {
        c.resolvedAt = uint64(block.timestamp);
        if (approved) {
            c.status = Status.Approved;
            c.approvedAmount = amount;
            uint128 difference = c.requestedAmount - amount;
            policies[c.policyId].used -= difference;
            openClaimExposure -= c.requestedAmount;
            committedPayouts += amount;
            if (difference != 0) emit ExposureReleased(claimId, c.policyId, difference);
            emit ClaimApproved(claimId, amount, appealRound);
        } else {
            c.status = Status.Rejected;
            c.appealDeadline = appealRound ? 0 : uint64(block.timestamp + APPEAL_WINDOW);
            emit ClaimRejected(claimId, c.requestedAmount, appealRound, c.appealDeadline);
        }
    }

    /// @notice Claimant-only, once, rejected-only, strictly before rejection+72h.
    /// Awaiting appeal assignment also times out in 72h; reservations persist.
    function appeal(bytes32 claimId) external {
        Claim storage c = _claim(claimId);
        if (msg.sender != c.claimant) revert Unauthorized();
        if (c.status != Status.Rejected || c.appealed || c.exposureReleased) revert InvalidState();
        if (block.timestamp >= c.appealDeadline) revert DeadlinePassed();
        c.appealed = true;
        c.status = Status.Appealed;
        c.deadline = uint64(block.timestamp + VOTING_PERIOD);
        emit ClaimAppealed(claimId, msg.sender, c.requestedAmount);
    }

    /// @notice Permissionless final exposure release; never releases Approved or
    /// Paid usage. Original unresolved rounds wait until deadline, even if three
    /// divergent votes arrived early. Rejected appeals may release immediately.
    function releaseExposure(bytes32 claimId) external {
        Claim storage c = _claim(claimId);
        if (c.exposureReleased) revert InvalidState();
        if (c.status == Status.Rejected) {
            if (!c.appealed && block.timestamp < c.appealDeadline) revert TooEarly();
        } else {
            if (!_pending(c.status) && c.status != Status.Unresolved) revert InvalidState();
            if (block.timestamp < c.deadline) revert TooEarly();
            if (c.status != Status.Unresolved) {
                c.status = Status.Unresolved;
                c.resolvedAt = uint64(block.timestamp);
                emit ClaimUnresolved(claimId, c.requestedAmount, c.appealed);
            }
        }
        c.exposureReleased = true;
        policies[c.policyId].used -= c.requestedAmount;
        openClaimExposure -= c.requestedAmount;
        emit ExposureReleased(claimId, c.policyId, c.requestedAmount);
    }

    /// @notice Atomic full claimant-only payout, first-come during insolvency.
    /// Balance need only cover this claim's approvedAmount, not aggregate unpaid
    /// approvals. Earlier settlements may leave later claims awaiting funding.
    /// Insufficient funds or token failure revert, preserving Approved status and
    /// accounting for retry; no partial payouts. committedPayouts still protects
    /// approved unpaid obligations from treasury transfers.
    /// Effects precede the external call, but Paid status/event follow success.
    function settle(bytes32 claimId) external nonReentrant {
        Claim storage c = _claim(claimId);
        if (c.status != Status.Approved || c.paid) revert InvalidState();
        uint128 amount = c.approvedAmount;
        if (token.balanceOf(address(this)) < amount) revert InsufficientFunds();
        c.paid = true;
        committedPayouts -= amount;
        token.safeTransfer(c.claimant, amount);
        c.status = Status.Paid;
        emit ClaimPaid(claimId, c.claimant, amount);
    }

    /// @notice Expired pending rounds are presented as Unresolved without a
    /// required keeper transaction. releaseExposure materializes this transition.
    function getClaim(bytes32 claimId) external view returns (Claim memory result) {
        result = _claim(claimId);
        if (_pending(result.status) && block.timestamp >= result.deadline) result.status = Status.Unresolved;
    }

    function getJury(bytes32 claimId, bool appealRound) external view returns (address[3] memory) {
        _claim(claimId);
        return appealRound ? _appealRounds[claimId].jurors : _originalRounds[claimId].jurors;
    }

    function getBallot(bytes32 claimId, bool appealRound, uint256 index) external view returns (Ballot memory) {
        if (index >= 3) revert InvalidInput();
        _claim(claimId);
        return appealRound ? _appealRounds[claimId].ballots[index] : _originalRounds[claimId].ballots[index];
    }

    /// @notice Snapshots the current verification epoch/count. Description is
    /// emitted and hash-stored; do not include medical/identity details.
    function proposeRules(uint128 contribution, uint128 limit, uint32 termDays_, string calldata description)
        external returns (uint256 proposalId)
    {
        _validateRules(contribution, limit, termDays_);
        proposalId = _newProposal(ProposalKind.Rules, description);
        Proposal storage p = _proposals[proposalId];
        p.contribution = contribution;
        p.limit = limit;
        p.term = termDays_;
        emit RulesProposed(proposalId, contribution, limit, termDays_);
    }

    function treasuryTransfersSupported() external pure returns (bool) { return true; }

    /// @notice One explicitly named, one-off transfer; <=10% free treasury both
    /// now and at execution. Cannot consume pending exposure or approved payouts.
    function proposeTreasuryTransfer(address recipient, uint128 amount, string calldata description)
        external returns (uint256 proposalId)
    {
        if (recipient == address(0) || recipient == address(this) || amount == 0) revert InvalidInput();
        if (amount > freeTreasury() / 10) revert InsufficientFunds();
        proposalId = _newProposal(ProposalKind.TreasuryTransfer, description);
        Proposal storage p = _proposals[proposalId];
        p.recipient = recipient;
        p.amount = amount;
        emit TreasuryTransferProposed(proposalId, recipient, amount);
    }

    function _newProposal(ProposalKind kind, string calldata description) private returns (uint256 id) {
        _requireVerified(msg.sender);
        id = nextProposalId++;
        Proposal storage p = _proposals[id];
        p.proposer = msg.sender;
        p.kind = kind;
        p.snapshotEpoch = verificationEpoch;
        p.eligibleCount = verifiedMemberCount;
        p.deadline = uint64(block.timestamp + VOTING_PERIOD);
        p.descriptionHash = keccak256(bytes(description));
        emit ProposalCreated(id, msg.sender, kind, p.snapshotEpoch, p.eligibleCount, p.deadline, description);
    }

    /// @notice Eligibility is historical, not current: verification/revocation
    /// after proposal creation cannot add/remove a voter's snapshot entitlement.
    function voteProposal(uint256 proposalId, bool support) external {
        Proposal storage p = _proposal(proposalId);
        if (block.timestamp >= p.deadline) revert DeadlinePassed();
        if (!verifiedAt(msg.sender, p.snapshotEpoch)) revert Unauthorized();
        if (proposalVoted[proposalId][msg.sender]) revert AlreadyVoted();
        proposalVoted[proposalId][msg.sender] = true;
        if (support) ++p.yesVotes;
        else ++p.noVotes;
        emit ProposalVote(proposalId, msg.sender, support);
    }

    /// @notice Permissionless after the 72h deadline; ceil(50% snapshot) quorum and
    /// ceil(2/3 votes cast) support. EARLY EXECUTION: before the deadline it is
    /// allowed only when every snapshotted eligible member has voted
    /// (yes + no == eligibleCount). Each snapshotted member can vote once and only
    /// snapshotted members can vote, so no eligible voter remains to be
    /// disenfranchised; members verified after the snapshot cannot add votes.
    /// The same quorum and support checks still apply. Execution does not iterate
    /// members or claim records. Rules are prospective: stored policy
    /// end/limit/usage never change here.
    function executeProposal(uint256 proposalId) external nonReentrant {
        Proposal storage p = _proposal(proposalId);
        if (p.executed) revert InvalidState();
        uint256 cast = p.yesVotes + p.noVotes;
        if (block.timestamp < p.deadline && cast != p.eligibleCount) revert TooEarly();
        if (cast == 0 || cast < Math.ceilDiv(p.eligibleCount, 2)
            || p.yesVotes < Math.mulDiv(cast, 2, 3, Math.Rounding.Ceil)) revert ProposalNotPassed();
        p.executed = true;
        if (p.kind == ProposalKind.Rules) {
            contributionAmount = p.contribution;
            coverageLimit = p.limit;
            termDays = p.term;
            emit RulesUpdated(proposalId, p.contribution, p.limit, p.term);
        } else {
            if (p.amount > freeTreasury() / 10) revert InsufficientFunds();
            token.safeTransfer(p.recipient, p.amount);
            emit TreasuryTransferred(proposalId, p.recipient, p.amount);
        }
        emit ProposalExecuted(proposalId, p.kind);
    }

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return _proposal(proposalId);
    }

    /// @notice Saturating free balance, conservatively excluding even claims
    /// whose release is available but has not yet been explicitly executed.
    function freeTreasury() public view returns (uint256) {
        uint256 balance = token.balanceOf(address(this));
        uint256 reserved = committedPayouts + openClaimExposure;
        return balance > reserved ? balance - reserved : 0;
    }

    /// @notice Binary search of immutable verification checkpoints; same-block
    /// verification changes have distinct epochs, so snapshots cannot shift.
    function verifiedAt(address member, uint64 epoch) public view returns (bool) {
        VerificationCheckpoint[] storage history = _verificationHistory[member];
        uint256 low;
        uint256 high = history.length;
        while (low < high) {
            uint256 mid = low + (high - low) / 2;
            if (history[mid].epoch <= epoch) low = mid + 1;
            else high = mid;
        }
        return low != 0 && history[low - 1].verified;
    }

    /// @notice Metadata contains ONLY policy id, pool address, start and end.
    function tokenURI(uint256 policyId) public view override returns (string memory) {
        _requireOwned(policyId);
        Policy storage p = policies[policyId];
        return string.concat("data:application/json,{\"id\":", Strings.toString(policyId),
            ",\"pool\":\"", Strings.toHexString(address(this)), "\",\"start\":", Strings.toString(p.start),
            ",\"end\":", Strings.toString(p.end), "}");
    }

    function approve(address, uint256) public pure override { revert Nontransferable(); }
    function setApprovalForAll(address, bool) public pure override { revert Nontransferable(); }
    function transferFrom(address, address, uint256) public pure override { revert Nontransferable(); }

    /// @dev Defense in depth: no transfer, self-transfer or burn through any path.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0) || to == address(0)) revert Nontransferable();
        return super._update(to, tokenId, auth);
    }

    function _requireVerified(address member) private view {
        if (!members[member] || !verifiedMembers[member]) revert Unauthorized();
    }

    function _claim(bytes32 claimId) private view returns (Claim storage c) {
        c = _claims[claimId];
        if (c.claimant == address(0)) revert MissingRecord();
    }

    function _proposal(uint256 proposalId) private view returns (Proposal storage p) {
        p = _proposals[proposalId];
        if (p.proposer == address(0)) revert MissingRecord();
    }

    function _pending(Status status) private pure returns (bool) {
        return status == Status.Submitted || status == Status.Voting
            || status == Status.Appealed || status == Status.AppealVoting;
    }

    function _validateRules(uint128 contribution, uint128 limit, uint32 term) private pure {
        if (contribution == 0 || limit == 0 || term == 0) revert InvalidInput();
    }
}
