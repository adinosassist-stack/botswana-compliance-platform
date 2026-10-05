export const THEBE_PRONUNCIATION_VERSION="2026-10-05.v294";

export const THEBE_PRONUNCIATION=Object.freeze({
  written:"Thebe",
  spoken:"TEH-beh",
  language:"Setswana",
  syllables:2,
  stress:"first"
});

export function thebePronunciationGuidance(){
  return [
    "Thebe is a Setswana name.",
    "Pronounce the brand name Thebe as TEH-beh: two syllables, with a clear T sound at the start, a clear B sound in the second syllable, and stress on the first syllable.",
    "Do not pronounce the initial Th as the English th sound.",
    "Keep the written brand name as Thebe."
  ].join(" ");
}

export function botswanaNameGuidance(){
  return "For Botswana and Setswana names, preserve local pronunciation when known rather than applying English pronunciation rules. If pronunciation is uncertain, do not invent a confident pronunciation.";
}
