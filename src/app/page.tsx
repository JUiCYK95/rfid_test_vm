import { redirect } from "next/navigation";
import { getDefaultCardToken } from "@/lib/profile";

export default function HomePage() {
  const cardToken = getDefaultCardToken();
  redirect(`/c/${cardToken || "unavailable"}`);
}
