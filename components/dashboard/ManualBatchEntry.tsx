"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Search, User } from "lucide-react";
import { useAddressBook } from "@/hooks/use-address-book";
import type { PaymentInstruction } from "@/lib/stellar/types";
import { 
  Command, 
  CommandEmpty, 
  CommandGroup, 
  CommandInput, 
  CommandItem, 
  CommandList 
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ManualBatchEntryProps {
  onPaymentsChange: (payments: PaymentInstruction[]) => void;
}

export function ManualBatchEntry({ onPaymentsChange }: ManualBatchEntryProps) {
  const [rows, setRows] = useState<Partial<PaymentInstruction>[]>([
    { address: "", amount: "", asset: "XLM" }
  ]);
  const { contacts } = useAddressBook();
  const [openPopoverIndex, setOpenPopoverIndex] = useState<number | null>(null);

  useEffect(() => {
    // Filter out incomplete rows before notifying parent
    const validPayments = rows.filter(
      r => r.address && r.amount && r.asset
    ) as PaymentInstruction[];
    onPaymentsChange(validPayments);
  }, [rows, onPaymentsChange]);

  const addRow = () => {
    setRows([...rows, { address: "", amount: "", asset: "XLM" }]);
  };

  const removeRow = (index: number) => {
    if (rows.length === 1) {
      setRows([{ address: "", amount: "", asset: "XLM" }]);
      return;
    }
    const newRows = [...rows];
    newRows.splice(index, 1);
    setRows(newRows);
  };

  const updateRow = (index: number, field: keyof PaymentInstruction, value: string) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    setRows(newRows);
  };

  const selectContact = (index: number, address: string) => {
    updateRow(index, "address", address);
    setOpenPopoverIndex(null);
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm font-medium text-slate-400">
              <th className="p-2">Recipient Address</th>
              <th className="p-2 w-32">Amount</th>
              <th className="p-2 w-32">Asset</th>
              <th className="p-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="space-y-2">
            {rows.map((row, idx) => (
              <tr key={idx} className="group">
                <td className="p-2">
                  <div className="relative flex items-center">
                    <Popover 
                      open={openPopoverIndex === idx} 
                      onOpenChange={(open) => setOpenPopoverIndex(open ? idx : null)}
                    >
                      <PopoverTrigger asChild>
                        <div className="w-full relative">
                          <Input
                            placeholder="Stellar address (G...)"
                            className="bg-slate-950 border-slate-800 text-white font-mono pr-10"
                            value={row.address}
                            onChange={(e) => updateRow(idx, "address", e.target.value)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full text-slate-500 hover:text-emerald-500"
                          >
                            <User className="h-4 w-4" />
                          </Button>
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 border-slate-800 bg-slate-900 w-[400px]" align="start">
                        <Command className="bg-slate-900">
                          <CommandInput placeholder="Search saved contacts..." className="text-white" />
                          <CommandList>
                            <CommandEmpty className="p-4 text-sm text-slate-500 text-center">
                              No contacts found. Add them in the Address Book.
                            </CommandEmpty>
                            {contacts.length > 0 && (
                              <CommandGroup heading="Saved Contacts" className="text-slate-400">
                                {contacts.map((contact) => (
                                  <CommandItem
                                    key={contact.id}
                                    onSelect={() => selectContact(idx, contact.address)}
                                    className="hover:bg-white/5 cursor-pointer p-2"
                                  >
                                    <div className="flex flex-col">
                                      <span className="font-medium text-white">{contact.name}</span>
                                      <span className="text-xs text-slate-500 font-mono">{contact.address}</span>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                </td>
                <td className="p-2">
                  <Input
                    placeholder="10.5"
                    type="number"
                    step="any"
                    className="bg-slate-950 border-slate-800 text-white"
                    value={row.amount}
                    onChange={(e) => updateRow(idx, "amount", e.target.value)}
                  />
                </td>
                <td className="p-2">
                  <Input
                    placeholder="XLM"
                    className="bg-slate-950 border-slate-800 text-white uppercase"
                    value={row.asset}
                    onChange={(e) => updateRow(idx, "asset", e.target.value.toUpperCase())}
                  />
                </td>
                <td className="p-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-slate-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeRow(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="border-slate-800 text-slate-300 hover:bg-slate-800 w-full"
        onClick={addRow}
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Recipient
      </Button>
    </div>
  );
}
