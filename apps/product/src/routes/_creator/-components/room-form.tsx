import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { roomInput, type RoomInput } from "../../../../shared/contracts/rooms";

export function RoomForm({
  initial = { question: "", options: ["", "", "", ""] },
  onSave,
  submitLabel,
  onCancel,
}: {
  initial?: RoomInput;
  onSave: (input: RoomInput) => Promise<void>;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const [question, setQuestion] = useState(initial.question);
  const [values, setValues] = useState(initial.options);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const parsed = roomInput.safeParse({ question, options: values });
    if (!parsed.success) {
      setError("Provide a question and 4–5 unique, nonempty options.");
      return;
    }
    setPending(true);
    setError("");
    try {
      await onSave(parsed.data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="max-w-2xl space-y-6" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-6">
        <label className="block text-sm font-medium">
          Question
          <input
            required
            maxLength={500}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="mt-2 h-11 w-full rounded-xl border bg-background px-3"
            placeholder="What should we name our product?"
          />
        </label>
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Options</legend>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Choose 4–5 options. Each participant will answer{" "}
            {(values.length * (values.length - 1)) / 2} comparisons.
          </p>
          {values.map((value, index) => (
            <div key={index} className="flex items-end gap-2">
              <label className="block min-w-0 flex-1 text-sm">
                Option {index + 1}
                <input
                  required
                  maxLength={200}
                  value={value}
                  onChange={(e) =>
                    setValues(values.map((v, i) => (i === index ? e.target.value : v)))
                  }
                  className="mt-1 h-11 w-full rounded-xl border bg-background px-3"
                />
              </label>
              {values.length > 4 && (
                <Button
                  type="button"
                  variant="outline"
                  aria-label={`Remove option ${index + 1}`}
                  onClick={() => setValues(values.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
        </fieldset>
        {values.length < 5 && (
          <Button type="button" variant="outline" onClick={() => setValues([...values, ""])}>
            Add option
          </Button>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : submitLabel}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
