"use client";

import { AddressBook } from "@/components/dashboard/AddressBook";
import Link from "next/link";

export default function AddressBookPage() {
  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/dashboard" className="text-slate-400 hover:text-white">
          Dashboard
        </Link>
        <span className="text-slate-600">›</span>
        <span className="text-emerald-500">Address Book</span>
      </div>

      {/* Page Title */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Address Book</h1>
        <p className="text-slate-400">
          Manage your frequent Stellar recipient addresses and contact aliases.
        </p>
      </div>

      <AddressBook />
    </div>
  );
}
