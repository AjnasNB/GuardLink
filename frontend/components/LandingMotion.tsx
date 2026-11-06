"use client";
import { useEffect } from "react";
export default function LandingMotion() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
        e.target.classList.add(
          e.target.hasAttribute("data-scene-motion") ? "scene-in-view" : "has-arrived",
        );
          observer.unobserve(e.target);
        }
      },
      { threshold: 0.12 },
    );
    document
      .querySelectorAll(
        ".story-section,.steps article,.community-copy,.closing,[data-scene-motion]",
      )
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return null;
}
