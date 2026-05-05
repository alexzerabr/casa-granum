"use client";

import { Search } from "lucide-react";
import {
  forwardRef,
  KeyboardEvent,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

export const SearchField = forwardRef<HTMLInputElement, Props>(
  function SearchField(
    {
      value,
      onChange,
      placeholder,
      onSubmit,
      autoFocus = false,
      className = "",
      ariaLabel,
      disabled = false,
    },
    ref,
  ) {
    const innerRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

    useEffect(() => {
      if (autoFocus) innerRef.current?.focus();
    }, [autoFocus]);

    const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && onSubmit) {
        e.preventDefault();
        onSubmit();
      }
    };

    return (
      <div className={`relative ${className}`}>
        <Search
          className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-inkmuted"
          strokeWidth={2}
          aria-hidden
        />
        <input
          ref={innerRef}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={ariaLabel}
          className="text-input pl-10"
        />
      </div>
    );
  },
);
