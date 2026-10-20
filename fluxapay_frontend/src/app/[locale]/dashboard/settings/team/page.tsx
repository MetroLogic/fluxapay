import type { Metadata } from "next";
import { TeamMembersPanel } from "@/features/dashboard/team/TeamMembersPanel";

export const metadata: Metadata = { title: "Team | Settings" };

export default function TeamSettingsPage() {
  return <TeamMembersPanel />;
}
