export const demoUsers = [
  {
    id: "gong-user-alex",
    email: "alex.morgan@example.com",
    firstName: "Alex",
    lastName: "Morgan",
    active: true,
  },
];

export const demoCalls = [
  {
    externalId: "7782342274025937895",
    url: "https://app.gong.io/call?id=7782342274025937895",
    title: "Acme <> Northstar product evaluation",
    startedAt: "2026-07-30T16:00:00.000Z",
    durationSeconds: 1840,
    primaryUserId: "gong-user-alex",
    language: "eng",
  },
  {
    externalId: "7782342274025937896",
    url: "https://app.gong.io/call?id=7782342274025937896",
    title: "Globex discovery",
    startedAt: "2026-07-31T14:30:00.000Z",
    durationSeconds: 920,
    primaryUserId: "gong-user-alex",
    language: "eng",
  },
];

export const demoParties = [
  {
    externalId: "p-internal",
    speakerId: "speaker-ae",
    name: "Alex Morgan",
    email: "alex.morgan@example.com",
    title: "Account Executive",
    affiliation: "Internal" as const,
  },
  {
    externalId: "p-external",
    speakerId: "speaker-buyer",
    name: "Jordan Lee",
    email: "jordan.lee@example.org",
    title: "VP Operations",
    affiliation: "External" as const,
  },
];

export const demoContext = {
  brief:
    "Northstar wants to replace manual call follow-up with a secure workflow before its Q4 rollout.",
  outline: ["Current process", "Security requirements", "Pilot plan"],
  highlights: ["Jordan asked for a security review", "A pilot was proposed for next Tuesday"],
  outcome: "Technical validation agreed",
  keyPoints: [
    "SOC 2 documentation is required",
    "Pilot group is five sellers",
    "Alex will send pricing and security material",
  ],
};

export const demoSegments = [
  {
    id: "seg-1",
    speakerId: "speaker-buyer",
    speakerName: "Jordan Lee",
    startMs: 12000,
    endMs: 22000,
    text: "Our team spends close to two hours every week writing follow-up emails after customer calls.",
    topic: "Current process",
  },
  {
    id: "seg-2",
    speakerId: "speaker-ae",
    speakerName: "Alex Morgan",
    startMs: 25000,
    endMs: 33000,
    text: "A five-seller pilot would let us prove the workflow before a broader rollout.",
    topic: "Pilot",
  },
  {
    id: "seg-3",
    speakerId: "speaker-buyer",
    speakerName: "Jordan Lee",
    startMs: 35000,
    endMs: 46000,
    text: "That works, but security needs the SOC 2 report and your retention details before we connect Gmail.",
    topic: "Security",
  },
  {
    id: "seg-4",
    speakerId: "speaker-ae",
    speakerName: "Alex Morgan",
    startMs: 50000,
    endMs: 61000,
    text: "I will send the security packet and pilot pricing tomorrow, then we can meet next Tuesday at ten Pacific.",
    topic: "Next steps",
  },
  {
    id: "seg-5",
    speakerId: "speaker-buyer",
    speakerName: "Jordan Lee",
    startMs: 63000,
    endMs: 68000,
    text: "Please include our IT lead Sam on that note.",
    topic: "Next steps",
  },
];
