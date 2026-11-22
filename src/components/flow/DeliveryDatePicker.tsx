"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { zhCN } from "react-day-picker/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** "YYYY-MM-DD" (the sender's local day) ⇄ a local Date at midnight. */
function toDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toDay(date: Date): string {
  return date.toLocaleDateString("en-CA");
}

const DAY = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" });
const WEEKDAY = new Intl.DateTimeFormat("zh-CN", { weekday: "short" });
/** "12月24日 周四" */
const label = (date: Date) => `${DAY.format(date)} ${WEEKDAY.format(date)}`;

interface Props {
  /** Selected day, "YYYY-MM-DD". */
  value: string;
  /** Earliest day that can be picked, "YYYY-MM-DD". */
  min: string;
  onChange(day: string): void;
}

/** The delivery day as a shadcn/ui date picker: a button that opens a calendar. */
export function DeliveryDatePicker({ value, min, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="送达日期"
        className="mt-2 flex w-full items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-left text-sm text-stone-800 transition hover:border-stone-300 data-[state=open]:border-stone-400"
      >
        <CalendarDays className="h-4 w-4 text-stone-400" />
        <span className="flex-1">{label(selected)}</span>
        <ChevronDown className="h-4 w-4 text-stone-400" />
      </PopoverTrigger>
      <PopoverContent align="start">
        <Calendar
          mode="single"
          locale={zhCN}
          formatters={{ formatCaption: (month) => `${month.getFullYear()}年${month.getMonth() + 1}月` }}
          labels={{ labelPrevious: () => "上个月", labelNext: () => "下个月" }}
          required
          selected={selected}
          defaultMonth={selected}
          startMonth={toDate(min)}
          disabled={{ before: toDate(min) }}
          onSelect={(date) => {
            if (!date) return;
            onChange(toDay(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
