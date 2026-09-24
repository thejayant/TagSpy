import type { Metadata } from "next";
import { AlertsApp } from "@/components/alerts-app";

export const metadata: Metadata = { title: "My alerts" };

export default function AlertsPage() {
  return <AlertsApp />;
}
