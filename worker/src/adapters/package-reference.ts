const publishedCodes = {
  SE020A: "4500",
  SE020B: "4000",
} as const;

// State Health Agency Kerala package master, Sheet1, Procedure ID and Package Amount.
// This dated catalog is research context; it is not a GuardLink tariff.
export function packageReference(communityId: string, procedureCode: string | null) {
  const code = procedureCode?.trim().toUpperCase();
  if (communityId !== "kerala-demo" || (code !== "SE020A" && code !== "SE020B")) return undefined;
  return {
    code,
    amountInr: publishedCodes[code],
    publishedOn: "2023-03-21",
    sourceUrl: "https://sha.kerala.gov.in/?page_id=157&lang=en",
  };
}
