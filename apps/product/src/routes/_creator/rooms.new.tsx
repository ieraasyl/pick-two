import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { createRoom } from "@/lib/rooms";
import { RoomForm } from "./-components/room-form";

export const Route = createFileRoute("/_creator/rooms/new")({ component: NewRoom });
function NewRoom() {
  const navigate = useNavigate();
  const client = useQueryClient();
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Create a ranking room</h1>
      <RoomForm
        submitLabel="Create room"
        onSave={async (input) => {
          const result = await createRoom(input);
          await client.invalidateQueries({ queryKey: ["rooms"] });
          await navigate({ to: "/rooms/$roomId", params: { roomId: result.room.id } });
        }}
      />
    </div>
  );
}
