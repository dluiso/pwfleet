"use client";

import { KeyRound, Pencil, Plus, Search, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
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
  passwordSet: boolean;
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
  const payload = (await response.json()) as { error?: string; details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> } };
  if (!response.ok) {
    const detail = [...(payload.details?.formErrors ?? []), ...Object.values(payload.details?.fieldErrors ?? {}).flat()][0];
    throw new Error([payload.error ?? "The user could not be saved.", detail].filter(Boolean).join(" "));
  }
}

export function AdminUserManager({
  users,
  currentActorId,
  currentActorRole,
  authenticationMode,
}: {
  users: UserRecord[];
  currentActorId: string;
  currentActorRole: UserRecord["role"];
  authenticationMode: "local" | "oidc";
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UserRecord | null | undefined>(undefined);
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    role: "driver" as UserRecord["role"],
    active: true,
    password: "",
    passwordConfirmation: "",
  });
  const [credentialUser, setCredentialUser] = useState<UserRecord | null>(null);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", password: "", passwordConfirmation: "" });
  const [deleteCandidate, setDeleteCandidate] = useState<UserRecord | null>(null);
  const [deleteForm, setDeleteForm] = useState({ confirmationEmail: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openEditor(user: UserRecord | null) {
    setForm(
      user
        ? { displayName: user.displayName, email: user.email, role: user.role, active: user.active, password: "", passwordConfirmation: "" }
        : { displayName: "", email: "", role: "driver", active: true, password: "", passwordConfirmation: "" },
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

  const availableRoles = currentActorRole === "administrator"
    ? roles
    : roles.filter((role) => role !== "administrator" && role !== "fleet_manager");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveRequest(
        selected ? `/api/admin/users/${selected.id}` : "/api/admin/users",
        selected ? "PATCH" : "POST",
        selected
          ? { displayName: form.displayName, email: form.email, role: form.role, active: form.active, recordVersion: selected.recordVersion }
          : { ...form, ...(authenticationMode === "oidc" ? { password: undefined, passwordConfirmation: undefined } : {}) },
      );
      setSelected(undefined);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The user could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!credentialUser) return;
    setBusy(true);
    setError(null);
    try {
      await saveRequest(`/api/admin/users/${credentialUser.id}/password`, "POST", { ...passwordForm, recordVersion: credentialUser.recordVersion });
      setCredentialUser(null);
      setPasswordForm({ currentPassword: "", password: "", passwordConfirmation: "" });
      if (credentialUser.id === currentActorId) {
        router.replace("/auth/login");
        router.refresh();
      }
      else router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The password could not be reset.");
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(event: React.FormEvent) {
    event.preventDefault();
    if (!deleteCandidate) return;
    setBusy(true);
    setError(null);
    try {
      await saveRequest(`/api/admin/users/${deleteCandidate.id}`, "DELETE", { ...deleteForm, recordVersion: deleteCandidate.recordVersion });
      setDeleteCandidate(null);
      setDeleteForm({ confirmationEmail: "", reason: "" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The user could not be deleted.");
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
          <p>{authenticationMode === "local" ? "Manage operational identities, local sign-in credentials, account status, and application roles." : "Manage operational identities and application roles. Sign-in is provided by Microsoft Entra."}</p>
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
                  <td><span className={(authenticationMode === "local" ? user.passwordSet : user.identityBound) ? "status-dot-label status-dot-active" : "status-dot-label"}>{authenticationMode === "local" ? (user.passwordSet ? "Password set" : "Password required") : (user.identityBound ? "Entra bound" : "Pending sign-in")}</span></td>
                  <td>{formatDateTime(user.updatedAt)}</td>
                  <td><div className="table-actions"><button type="button" title="Edit user" onClick={() => openEditor(user)}><Pencil size={15} /></button>{authenticationMode === "local" ? <button type="button" disabled={busy} title={user.id === currentActorId ? "Change your password" : "Reset local password"} onClick={() => { setError(null); setPasswordForm({ currentPassword: "", password: "", passwordConfirmation: "" }); setCredentialUser(user); }}><KeyRound size={15} /></button> : null}{authenticationMode === "oidc" && user.identityBound ? <button type="button" disabled={busy} title="Reset external identity binding" onClick={() => resetIdentity(user)}><KeyRound size={15} /></button> : null}{user.id !== currentActorId ? <button type="button" disabled={busy} title="Delete unused user" onClick={() => { setError(null); setDeleteForm({ confirmationEmail: "", reason: "" }); setDeleteCandidate(user); }}><Trash2 size={15} /></button> : null}</div></td>
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
                <label><span>Application role *</span><select value={form.role} disabled={selected?.id === currentActorId} onChange={(event) => setForm({ ...form, role: event.target.value as UserRecord["role"] })}>{availableRoles.map((role) => <option value={role} key={role}>{formatEnum(role)}</option>)}</select></label>
                <label className="checkbox-field"><input type="checkbox" checked={form.active} disabled={selected?.id === currentActorId} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span>Active account</span></label>
                {!selected && authenticationMode === "local" ? <><label className="admin-form-wide"><span>Initial password *</span><input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label><label className="admin-form-wide"><span>Confirm initial password *</span><input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={form.passwordConfirmation} onChange={(event) => setForm({ ...form, passwordConfirmation: event.target.value })} /></label><p className="admin-form-hint admin-form-wide">Use 12–128 characters with uppercase, lowercase, a number, and a symbol. Passwords are hashed and are never displayed again.</p></> : null}
                {!selected && authenticationMode === "oidc" ? <p className="admin-form-hint admin-form-wide">No password is stored. The email address must match the user’s Microsoft Entra sign-in.</p> : null}
                {error ? <p className="modal-error admin-form-wide">{error}</p> : null}
              </div>
              <footer><button className="button button-secondary" type="button" onClick={() => setSelected(undefined)}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save user"}</button></footer>
            </form>
          </section>
        </div>
      ) : null}
      {credentialUser ? <div className="modal-backdrop" role="presentation"><section className="admin-modal admin-modal-small" role="dialog" aria-modal="true" aria-labelledby="password-modal-title"><header><div><span className="eyebrow">LOCAL AUTHENTICATION</span><h2 id="password-modal-title">{credentialUser.id === currentActorId ? "Change your password" : `Reset password · ${credentialUser.displayName}`}</h2></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={() => !busy && setCredentialUser(null)}><X size={19} /></button></header><form onSubmit={resetPassword}><div className="modal-body admin-form-grid"><p className="admin-form-hint admin-form-wide">The new password immediately revokes {credentialUser.id === currentActorId ? "all of your sessions and returns you to sign-in" : "this user’s existing sessions"}.</p>{credentialUser.id === currentActorId ? <label className="admin-form-wide"><span>Current password *</span><input required type="password" autoComplete="current-password" maxLength={128} value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} /></label> : null}<label className="admin-form-wide"><span>New password *</span><input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={passwordForm.password} onChange={(event) => setPasswordForm({ ...passwordForm, password: event.target.value })} /></label><label className="admin-form-wide"><span>Confirm new password *</span><input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={passwordForm.passwordConfirmation} onChange={(event) => setPasswordForm({ ...passwordForm, passwordConfirmation: event.target.value })} /></label>{error ? <p className="modal-error admin-form-wide">{error}</p> : null}</div><footer><button className="button button-secondary" type="button" onClick={() => setCredentialUser(null)}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : credentialUser.id === currentActorId ? "Change password" : "Reset password"}</button></footer></form></section></div> : null}
      {deleteCandidate ? <div className="modal-backdrop" role="presentation"><section className="admin-modal admin-modal-small" role="dialog" aria-modal="true" aria-labelledby="delete-user-modal-title"><header><div><span className="eyebrow">CONTROLLED DELETION</span><h2 id="delete-user-modal-title">Delete unused user</h2></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={() => !busy && setDeleteCandidate(null)}><X size={19} /></button></header><form onSubmit={removeUser}><div className="modal-body admin-form-grid"><div className="danger-zone admin-form-wide"><strong>{deleteCandidate.displayName}</strong><p>Permanent deletion is allowed only when the account has no operational history. Otherwise, edit the user and clear Active account to preserve audit records.</p></div><label className="admin-form-wide"><span>Type {deleteCandidate.email} to confirm *</span><input required type="email" value={deleteForm.confirmationEmail} onChange={(event) => setDeleteForm({ ...deleteForm, confirmationEmail: event.target.value })} /></label><label className="admin-form-wide"><span>Reason *</span><textarea required minLength={8} maxLength={500} rows={3} value={deleteForm.reason} onChange={(event) => setDeleteForm({ ...deleteForm, reason: event.target.value })} /></label>{error ? <p className="modal-error admin-form-wide">{error}</p> : null}</div><footer><button className="button button-secondary" type="button" onClick={() => setDeleteCandidate(null)}>Cancel</button><button className="button button-danger" type="submit" disabled={busy || deleteForm.confirmationEmail.trim().toLowerCase() !== deleteCandidate.email.toLowerCase()}>{busy ? "Deleting…" : "Delete user"}</button></footer></form></section></div> : null}
    </div>
  );
}
