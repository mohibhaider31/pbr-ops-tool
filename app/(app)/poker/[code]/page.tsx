import PokerRoom from "@/components/PokerRoom";
export default function PokerRoomPage({ params }: { params: { code: string } }) {
  return <PokerRoom code={params.code} />;
}
