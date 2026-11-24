import { useEffect, useState, type FormEvent } from "react";
import { Camera, Pencil } from "lucide-react";
import { ApiError, profileDetails, provinces, type User } from "@autocars/core";
import { api, useApp } from "./lib";

export function ProfilePanel({ user }: { user: User }) {
  const { refresh, notify } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => profileDetails(user));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(profileDetails(user));
  }, [user, editing]);
  useEffect(() => setPhotoFailed(false), [user.avatarUrl]);
  const fail = (error: unknown) => {
    if (error instanceof ApiError) setErrors(error.fieldErrors);
    notify((error as Error).message || "Please try again.");
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api.patch("/me/profile", draft);
      await refresh();
      setEditing(false);
      notify("Profile saved across your devices.");
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  async function photo(file?: File, remove = false) {
    if (!file && !remove) return;
    setBusy(true);
    try {
      if (remove) await api.delete("/me/avatar");
      else {
        if (file!.size > 8 * 1024 * 1024)
          throw new Error("Choose a photo smaller than 8 MB.");
        const body = new FormData();
        body.append("file", file!);
        await api.request("/me/avatar", { method: "POST", body });
      }
      await refresh();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel profile-panel" aria-label="Your profile">
      <div className="profile-identity">
        {user.avatarUrl && !photoFailed ? (
          <img
            className="profile-avatar"
            src={api.image(user.avatarUrl)}
            alt="Your profile"
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <div className="profile-avatar profile-initials" aria-hidden="true">
            {user.name
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase()}
          </div>
        )}
        <div>
          <h3>{user.name}</h3>
          <p>{user.email}</p>
        </div>
      </div>
      <div className="button-row profile-photo-actions">
        <label className={`button outline small ${busy ? "disabled" : ""}`}>
          <Camera size={17} /> Change photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              void photo(file);
            }}
          />
        </label>
        {!!user.avatarUrl && (
          <button
            className="button outline small"
            disabled={busy}
            onClick={() => photo(undefined, true)}
          >
            Remove photo
          </button>
        )}
      </div>
      {busy && <p role="status">Saving profile…</p>}
      {editing ? (
        <form className="form-stack profile-form" onSubmit={save}>
          {(
            [
              ["name", "Full name"],
              ["phone", "Phone number (optional)"],
              ["city", "City / town (optional)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                name={key}
                value={draft[key]}
                disabled={busy}
                required={key === "name"}
                minLength={key === "name" ? 2 : undefined}
                maxLength={key === "phone" ? 30 : 100}
                type={key === "phone" ? "tel" : "text"}
                autoComplete={
                  key === "name"
                    ? "name"
                    : key === "phone"
                      ? "tel"
                      : "address-level2"
                }
                aria-invalid={!!errors[key]}
                aria-describedby={
                  errors[key] ? `profile-${key}-error` : undefined
                }
                onChange={(event) => {
                  setDraft({ ...draft, [key]: event.target.value });
                  setErrors({ ...errors, [key]: "" });
                }}
              />
              {!!errors[key] && (
                <small id={`profile-${key}-error`} className="field-error">
                  {errors[key]}
                </small>
              )}
            </label>
          ))}
          <label>
            Province (optional)
            <select
              value={draft.province}
              disabled={busy}
              onChange={(event) =>
                setDraft({ ...draft, province: event.target.value })
              }
            >
              <option value="">Choose province</option>
              {provinces.map((province) => (
                <option key={province}>{province}</option>
              ))}
            </select>
            {!!errors.province && (
              <small className="field-error">{errors.province}</small>
            )}
          </label>
          <div className="button-row">
            <button className="button dark" disabled={busy}>
              {busy ? "Saving…" : "Save profile"}
            </button>
            <button
              className="button outline"
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setErrors({});
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          {!!user.phone && <p>{user.phone}</p>}
          {!!(user.city || user.province) && (
            <p>{[user.city, user.province].filter(Boolean).join(", ")}</p>
          )}
          <button
            className="button outline small"
            disabled={busy}
            onClick={() => setEditing(true)}
          >
            <Pencil size={16} /> Edit profile
          </button>
        </>
      )}
    </section>
  );
}
