"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function DeleteRequestButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this request and all pending jobs?")) return;
    setLoading(true);
    await fetch(`/api/requests/${id}`, { method: "DELETE" });
    setLoading(false);
    router.refresh();
  }

  return (
    <Button variant="danger" size="sm" loading={loading} onClick={handleDelete}>
      Delete
    </Button>
  );
}
