import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { COUNTRY_CODES, countryName, isKnownCountryIso } from '@/lib/structure/countries';

interface Props {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
}

/**
 * Searchable country picker. Stores the ISO 3166-1 alpha-2 code; renders the
 * full country name via Intl.DisplayNames. A "Not in list" escape hatch flips
 * the UI into a free-text input for non-standard codes (e.g. legacy alpha-3 or
 * sub-national designators the AI extractor produced).
 */
export function JurisdictionPicker({ id, value, onChange, placeholder = 'Select a country…' }: Props) {
  const [customMode, setCustomMode] = useState(() => value !== '' && !isKnownCountryIso(value));
  const [open, setOpen] = useState(false);

  // Re-derive mode when the value changes from outside (e.g. user switched
  // selected entity). Typing in custom mode keeps customMode=true unless the
  // typed value happens to be a recognized ISO, in which case we fall back to
  // the picker — a soft hint that "we already know that one."
  useEffect(() => {
    setCustomMode(value !== '' && !isKnownCountryIso(value));
  }, [value]);

  const items = useMemo(
    () =>
      COUNTRY_CODES.map((iso) => ({ iso, name: countryName(iso) })).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [],
  );

  if (customMode) {
    return (
      <div className="space-y-1">
        <Input
          id={id}
          value={value}
          maxLength={3}
          placeholder="Custom code"
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          autoFocus
        />
        <button
          type="button"
          className="text-xs text-muted-foreground underline hover:text-foreground"
          onClick={() => {
            setCustomMode(false);
            onChange('');
          }}
        >
          Choose from list instead
        </button>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className={cn('truncate', !value && 'text-muted-foreground')}>
              {value ? `${countryName(value)} (${value})` : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search country or code…" />
            <CommandList>
              <CommandEmpty>No match.</CommandEmpty>
              <CommandGroup>
                {items.map(({ iso, name }) => (
                  <CommandItem
                    key={iso}
                    value={`${name} ${iso}`}
                    onSelect={() => {
                      onChange(iso);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn('mr-2 h-4 w-4', value === iso ? 'opacity-100' : 'opacity-0')}
                    />
                    <span className="flex-1 truncate">{name}</span>
                    <span className="ml-2 text-xs text-muted-foreground tabular-nums">{iso}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup className="sticky bottom-0 bg-popover border-t border-border">
                <CommandItem
                  onSelect={() => {
                    setCustomMode(true);
                    setOpen(false);
                    onChange('');
                  }}
                  className="text-muted-foreground"
                >
                  Not in list — enter code manually
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
    </Popover>
  );
}
