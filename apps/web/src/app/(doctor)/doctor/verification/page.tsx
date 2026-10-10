import { redirect } from "next/navigation";
import { Clock3, FileCheck2, ShieldCheck } from "lucide-react";
import { requireAccountRole } from "@/lib/auth/server";

export default async function DoctorVerificationPage() {
  const session = await requireAccountRole("DOCTOR");
  if (session.verificationStatus === "VERIFIED") redirect("/doctor/dashboard");
  return <section className="card verification-state">
    <div className="verification-symbol">{session.verificationStatus === "REJECTED" ? <FileCheck2 size={27} /> : <Clock3 size={27} />}</div>
    <span className="role-badge">{session.verificationStatus === "REJECTED" ? "Changes requested" : "Pending verification"}</span>
    <h1>{session.verificationStatus === "REJECTED" ? "Update your professional information" : "Your registration is under review"}</h1>
    <p>{session.verificationStatus === "REJECTED" ? "Review the secure message from CareNow and update the requested registration information." : "CareNow is reviewing your professional information and documents. Clinical tools will be available after your account is verified and activated."}</p>
    <div className="verification-steps"><div><ShieldCheck size={16} /><span>Account submitted</span><strong>Complete</strong></div><div><FileCheck2 size={16} /><span>Documents reviewed</span><strong>{session.verificationStatus === "REJECTED" ? "Action needed" : "In review"}</strong></div><div><span aria-hidden="true">✚</span><span>Portal access</span><strong>After verification</strong></div></div>
    <button className="button secondary" type="button" disabled>Registration details are managed through the CareNow API</button>
  </section>;
}
