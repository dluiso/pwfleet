"use client";

import { KeyRound, Pencil, Plus, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDateTime, formatEnum } from "@/lib/format";

type UserRecord = {
  id: string;
  email: string;
  displayName: string;
  role: "driver" | "supervisor" | "fleet_manager" | "maintenance_technician" | "administrator" | "auditor";
  active: boolean;
  recordVersion: number;
  createdAt: Date;
  updatedAt: Date;
  identityBound: boolean;
};

const roles: UserRecord["role"][] = [
  "driver",
  "supervisor",
  "fleet_manager",
  "maintenance_technician",
  "administrator",
  "auditor",
];

async function saveRequest(url: string, method: string, body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "The user could not be saved.");
}

export function AdminUserManager({
  users,
  currentActorId,
}: {
  users: UserRecord[];
  currentActorId: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UserRecord | null | undefined>(undefined);
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    role: "driver" as UserRecord["role"],
    active: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openEditor(user: UserRecord | null) {
    setForm(
      user
        ? { displayName: user.displayName, email: user.email, role: user.role, active: user.active }
        : { displayName: "", email: "", role: "driver", active: true },
    );
    setError(null);
    setSelected(user);
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) =>
      [user.displayName, user.email, user.role].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [search, users]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveRequest(
        selected ? `/api/admin/users/${selected.id}` : "/api/admin/users",
        selected ? "PATCH" : "POST",
        { ...form, ...(selected ? { recordVersion: selected.recordVersion } : {}) },
      );
      setSelected(undefined);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The user could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function resetIdentity(user: UserRecord) {
    const reason = window.prompt(`Reset the external identity binding for ${user.displayName}? Enter the verified reason (minimum 8 characters).`);
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await saveRequest(`/api/admin/users/${user.id}/identity-binding`, "POST", { action: "reset_identity_binding", reason });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The identity binding could not be reset.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-heading-row">
        <div>
          <span className="eyebrow">ACCESS CONTROL</span>
          <h1>User administration</h1>
          <p>Manage operational identities and application roles. Authentication remains external in production.</p>
        </div>
        <button className="button button-primary" type="button" onClick={() => openEditor(null)}>
          <Plus size={17} /> Add user
        </button>
      </section>
      <section className="panel admin-table-panel">
        <div className="directory-toolbar">
          <label className="search-box">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, or role…" />
          </label>
          <span className="record-count">{filtered.length} users</span>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Identity</th><th>Last updated</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id}>
                  <td><div className="table-primary"><span className="user-table-avatar"><UserRound size={17} /></span><div><strong>{user.displayName}{user.id === currentActorId ? " (You)" : ""}</strong><span>{user.email}</span></div></div></td>
                  <td><span className="role-chip"><ShieldCheck size={13} />{formatEnum(user.role)}</span></td>
                  <td><span className={user.active ? "status-dot-label status-dot-active" : "status-dot-label"}>{user.active ? "Active" : "Inactive"}</span></td>
                  <td><span className={user.identityBound ? "status-dot-label status-dot-active" : "status-dot-label"}>{user.identityBound ? "Bound" : "Pending sign-in"}</span></td>
                  <td>{formatDateTime(user.updatedAt)}</td>
                  <td><div className="table-actions"><button type="button" title="Edit user" onClick={() => openEditor(user)}><Pencil size={15} /></button>{user.identityBound ? <button type="button" disabled={busy} title="Reset external identity binding" onClick={() => resetIdentity(user)}><KeyRound size={15} /></button> : null}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {selected !== undefined ? (
        <div className="modal-backdrop" role="presentation">
          <section className="admin-modal admin-modal-small" role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
            <header><div><span className="eyebrow">ACCESS CONTROL</span><h2 id="user-modal-title">{selected ? "Edit user" : "Add user"}</h2></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={() => !busy && setSelected(undefined)}><X size={19} /></button></header>
            <form onSubmit={submit}>
              <div className="modal-body admin-form-grid">
                <label className="admin-form-wide"><span>Display name *</span><input required minLength={2} maxLength={160} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
                <label className="admin-form-wide"><span>Email address *</span><input required type="email" maxLength={320} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
                <label><span>Application role *</span><select value={form.role} disabled={selected?.id === currentActorId} onChange={(event) => setForm({ ...form, role: event.target.value as UserRecord["role"] })}>{roles.map((role) => <option value={role} key={role}>{formatEnum(role)}</option>)}</select></label>
                <label className="checkbox-field"><input type="checkbox" checked={form.active} disabled={selected?.id === currentActorId} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span>Active account</span></label>
                {error ? <p className="modal-error admin-form-wide">{error}</p> : null}
              </div>
              <footer><button className="button button-secondary" type="button" onClick={() => setSelected(undefined)}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save user"}</button></footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
