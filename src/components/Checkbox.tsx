import { Check, Minus } from "lucide-react";

export default function Checkbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}) {
  const active = checked || indeterminate;
  return (
    <button
      type="button"
      onClick={onChange}
      className={`w-[18px] h-[18px] rounded-[4px] flex-shrink-0 flex items-center justify-center border transition-all duration-150 ${
        active
          ? "bg-orange-500 border-orange-500"
          : "border-gray-300 dark:border-gray-600 hover:border-gray-500 dark:hover:border-gray-400 bg-white dark:bg-gray-900"
      }`}
    >
      {indeterminate && !checked ? (
        <Minus className="w-2.5 h-2.5 text-white" strokeWidth={3} />
      ) : checked ? (
        <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
      ) : null}
    </button>
  );
}
