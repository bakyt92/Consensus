import { redirect } from "next/navigation";
import { getSessionUser } from "@/src/lib/session";

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect("/lobby");
  redirect("/sign-up");
}
