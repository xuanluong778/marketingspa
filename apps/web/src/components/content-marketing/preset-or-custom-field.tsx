'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FORM_CUSTOM_VALUE } from '@/types/content-marketing';

export function PresetOrCustomField({
  label,
  required,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  onChange: (next: string) => void;
}) {
  const isPresetValue = useMemo(
    () => options.some((o) => o.value === value),
    [options, value],
  );

  const [customActive, setCustomActive] = useState(
    () => value.trim() !== '' && !options.some((o) => o.value === value),
  );

  useEffect(() => {
    if (value.trim() && !options.some((o) => o.value === value)) {
      setCustomActive(true);
    }
  }, [value, options]);

  const selectValue = customActive
    ? FORM_CUSTOM_VALUE
    : isPresetValue
      ? value
      : undefined;

  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required ? ' *' : ''}
      </Label>
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === FORM_CUSTOM_VALUE) {
            setCustomActive(true);
            if (isPresetValue) onChange('');
            return;
          }
          setCustomActive(false);
          onChange(v);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Chọn..." />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
          <SelectItem value={FORM_CUSTOM_VALUE}>Khác (nhập tay)</SelectItem>
        </SelectContent>
      </Select>
      {customActive && (
        <Input
          value={value}
          placeholder={placeholder}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
