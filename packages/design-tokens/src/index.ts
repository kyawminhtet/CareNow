export const colors = {
  blue: "#2563eb",
  teal: "#0f766e",
  navy: "#10264d",
  purple: "#7c3aed",
  background: "#f4f7fc",
  border: "#e5eaf2",
} as const;

export const businessRules = {
  defaultTimeZone: "Asia/Yangon",
  consultationTypes: ["ONLINE", "IN_PERSON"] as const,
  doctorWebPushEnabled: false,
  administratorWebPushEnabled: false,
} as const;
