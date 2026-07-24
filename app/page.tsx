import BacklogBoard from "@/components/BacklogBoard";

export default function Home() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#12142b]">Backlog Review</h1>
        <p className="text-sm text-[#6b7290] mt-1">
          Prioritize, assign, and clear stories for PBR. Marking a story
          &quot;PBR Done&quot; moves it to Ready for Dev in Jira automatically.
        </p>
      </div>
      <BacklogBoard />
    </div>
  );
}
