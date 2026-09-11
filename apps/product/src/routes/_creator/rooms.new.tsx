import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { roomMutations } from "@/lib/rooms";
import { RoomForm } from "./-components/room-form";

export const Route = createFileRoute("/_creator/rooms/new")({ component: NewRoom });
function NewRoom() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const create = useMutation(roomMutations.create(client));
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Create a ranking room</h1>
      <RoomForm
        submitLabel="Create room"
        onSave={async (input) => {
          const result = await create.mutateAsync(input);
          await navigate({ to: "/rooms/$roomId", params: { roomId: result.room.id } });
        }}
      />
    </div>
  );
}
