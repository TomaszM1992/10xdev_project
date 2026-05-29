import { useState } from "react";
import { CircleAlert, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  error?: string;
}

export function TagInput({ tags, onChange, error }: TagInputProps) {
  const [input, setInput] = useState("");
  const [inlineError, setInlineError] = useState("");

  function addTag() {
    const tag = input.trim().toLowerCase();
    if (!tag) return;
    if (tag.length > 50) {
      setInlineError("Tag must be 50 characters or less");
      return;
    }
    if (tags.includes(tag)) {
      setInlineError("Tag already added");
      return;
    }
    if (tags.length >= 5) {
      setInlineError("Maximum 5 tags allowed");
      return;
    }
    onChange([...tags, tag]);
    setInput("");
    setInlineError("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  const displayError = inlineError || error;

  return (
    <div>
      <label className="mb-1 block text-sm text-blue-100/80">Tags</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
            <Tag className="size-4" />
          </span>
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setInlineError("");
            }}
            onKeyDown={handleKeyDown}
            placeholder="Add a tag…"
            className={cn(
              "w-full rounded-lg border bg-white/10 px-3 py-2 pl-10 text-white placeholder-white/40 transition-colors focus:ring-2 focus:outline-none",
              displayError ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
            )}
          />
        </div>
        <Button type="button" variant="outline" onClick={addTag} className="shrink-0">
          Add
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-200"
            >
              {tag}
              <button
                type="button"
                onClick={() => {
                  removeTag(tag);
                }}
                className="hover:text-white"
                aria-label={`Remove tag ${tag}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {displayError && (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
          <CircleAlert className="size-3" />
          {displayError}
        </p>
      )}
    </div>
  );
}
