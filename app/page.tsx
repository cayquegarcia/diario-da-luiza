import { requireChatGPTUser } from "./chatgpt-auth";
import { LuizaDashboard } from "./luiza-dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireChatGPTUser("/");
  return <LuizaDashboard />;
}
