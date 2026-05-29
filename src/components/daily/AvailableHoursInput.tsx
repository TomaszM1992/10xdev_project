interface AvailableHoursInputProps {
  value: number;
  onChange: (hours: number) => void;
}

export function AvailableHoursInput({ value, onChange }: AvailableHoursInputProps) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor="available-hours" className="text-sm text-blue-100/70">
        Available hours today:
      </label>
      <input
        id="available-hours"
        type="number"
        min="0.25"
        max="24"
        step="0.25"
        value={value}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value);
          if (!isNaN(parsed) && parsed >= 0.25 && parsed <= 24) onChange(parsed);
        }}
        className="w-20 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-center text-sm text-white"
      />
    </div>
  );
}
