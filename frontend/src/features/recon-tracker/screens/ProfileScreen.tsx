import { useRef, useState } from 'react';
import { Camera, Check, CircleCheck, KeyRound, Trash2, TriangleAlert, X } from 'lucide-react';
import { ApiError } from '../api/client';
import { changePassword } from '../api/gateway';
import { fileToAvatarDataUrl } from '../lib/avatar';
import { checkPasswordRules } from '../lib/password';
import type { MeResponse } from '../types';

interface ProfileScreenProps {
  user: MeResponse;
  onUpdateProfile: (patch: { name?: string; avatar_url?: string }) => Promise<MeResponse>;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}

export function ProfileScreen({ user, onUpdateProfile }: ProfileScreenProps) {
  const [name, setName] = useState(user.name);
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsDone, setDetailsDone] = useState(false);

  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordDone, setPasswordDone] = useState(false);

  const rules = checkPasswordRules(next);
  const dirty = name.trim() !== user.name;

  const saveDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    setDetailsError(null);
    setDetailsDone(false);

    if (name.trim() === '') {
      setDetailsError('Name is required');
      return;
    }

    setDetailsBusy(true);
    try {
      await onUpdateProfile({ name: name.trim() });
      setDetailsDone(true);
    } catch (caught) {
      setDetailsError(caught instanceof ApiError ? caught.message : 'Could not save your profile');
    } finally {
      setDetailsBusy(false);
    }
  };

  const pickPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset immediately: without this, re-picking the same file after a failed
    // attempt fires no change event and the retry looks like a dead button.
    event.target.value = '';
    if (!file) return;

    setPhotoError(null);
    setPhotoBusy(true);
    try {
      await onUpdateProfile({ avatar_url: await fileToAvatarDataUrl(file) });
    } catch (caught) {
      setPhotoError(
        caught instanceof ApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : 'Could not update your photo',
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      // An empty string, not an omitted field: omission means "unchanged".
      await onUpdateProfile({ avatar_url: '' });
    } catch (caught) {
      setPhotoError(caught instanceof ApiError ? caught.message : 'Could not remove your photo');
    } finally {
      setPhotoBusy(false);
    }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordDone(false);

    if (!rules.every(rule => rule.met)) {
      setPasswordError('The new password does not meet every requirement');
      return;
    }
    if (next !== confirm) {
      setPasswordError('The new passwords do not match');
      return;
    }

    setPasswordBusy(true);
    try {
      await changePassword(current, next);
      setPasswordDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (caught) {
      const message =
        caught instanceof ApiError && caught.status === 401
          ? 'That is not your current password'
          : caught instanceof ApiError && caught.status === 429
            ? 'Too many attempts — wait a few minutes'
            : caught instanceof ApiError
              ? caught.message
              : 'Could not change your password';
      setPasswordError(message);
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <>
      <div className="rt-welcome">
        <h1>Profile</h1>
        <p>Your account details, photo and password</p>
      </div>

      <section className="rt-card rt-panel" aria-labelledby="rt-profile-identity">
        <div className="rt-card-header">
          <div>
            <h2 className="rt-card-title" id="rt-profile-identity">
              Account
            </h2>
            <p className="rt-card-subtitle">How you appear across the platform</p>
          </div>
        </div>

        <div className="rt-profile-identity">
          <div className="rt-profile-photo">
            {user.avatar_url ? (
              <img className="rt-profile-avatar" src={user.avatar_url} alt={`${user.name}'s profile photo`} />
            ) : (
              <span className="rt-profile-avatar rt-profile-avatar-empty" aria-hidden="true">
                {initials(user.name)}
              </span>
            )}

            <div className="rt-profile-photo-actions">
              {/*
                A plain file input styled as a button. The label is the control
                a screen reader announces, so the input itself is hidden rather
                than removed — `display: none` would take it out of the
                accessibility tree along with its keyboard focus.
              */}
              <label className="rt-btn-ghost rt-btn-sm rt-profile-upload">
                <Camera size={14} aria-hidden="true" />
                {photoBusy ? 'Saving…' : user.avatar_url ? 'Change photo' : 'Upload photo'}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="rt-visually-hidden"
                  disabled={photoBusy}
                  onChange={event => void pickPhoto(event)}
                />
              </label>

              {user.avatar_url && (
                <button
                  type="button"
                  className="rt-btn-ghost rt-btn-sm"
                  disabled={photoBusy}
                  onClick={() => void removePhoto()}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Remove
                </button>
              )}
            </div>

            <p className="rt-profile-photo-hint">
              Cropped square and resized to 256px before it is stored.
            </p>

            {photoError && (
              <p className="rt-field-error" role="alert">
                <TriangleAlert size={14} aria-hidden="true" />
                {photoError}
              </p>
            )}
          </div>

          <form className="rt-profile-form" onSubmit={saveDetails}>
            <div className="rt-field">
              <label htmlFor="rt-profile-name">Name</label>
              <input
                id="rt-profile-name"
                className="rt-input"
                autoComplete="name"
                value={name}
                onChange={event => {
                  setName(event.target.value);
                  setDetailsDone(false);
                }}
              />
            </div>

            <div className="rt-field">
              <label htmlFor="rt-profile-email">Email</label>
              <input
                id="rt-profile-email"
                className="rt-input"
                type="email"
                value={user.email}
                readOnly
                aria-describedby="rt-profile-email-hint"
              />
              <p className="rt-field-hint" id="rt-profile-email-hint">
                Your email is the login identity for this account and cannot be changed here.
              </p>
            </div>

            {detailsError && (
              <p className="rt-field-error" role="alert">
                <TriangleAlert size={14} aria-hidden="true" />
                {detailsError}
              </p>
            )}
            {detailsDone && (
              <p className="rt-field-ok" role="status">
                <CircleCheck size={14} aria-hidden="true" />
                Profile saved
              </p>
            )}

            <button type="submit" className="rt-btn-primary" disabled={detailsBusy || !dirty}>
              {detailsBusy ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </div>
      </section>

      <section className="rt-card rt-panel" aria-labelledby="rt-profile-password">
        <div className="rt-card-header">
          <div>
            <h2 className="rt-card-title" id="rt-profile-password">
              Password
            </h2>
            <p className="rt-card-subtitle">
              Your current password is required — a stolen session must not be enough to lock
              you out
            </p>
          </div>
        </div>

        <form className="rt-profile-form" onSubmit={savePassword}>
          <div className="rt-field">
            <label htmlFor="rt-profile-current">Current password</label>
            <input
              id="rt-profile-current"
              className="rt-input"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={event => setCurrent(event.target.value)}
            />
          </div>

          <div className="rt-field">
            <label htmlFor="rt-profile-next">New password</label>
            <input
              id="rt-profile-next"
              className="rt-input"
              type="password"
              autoComplete="new-password"
              aria-describedby="rt-profile-rules"
              value={next}
              onChange={event => {
                setNext(event.target.value);
                setPasswordDone(false);
              }}
            />
          </div>

          {/* The same rules the signup screen shows, from the same function, so
              the two screens cannot drift apart. The tick carries the state
              alongside the colour — colour alone fails WCAG 1.4.1. */}
          <ul className="rt-rules" id="rt-profile-rules">
            {rules.map(rule => (
              <li key={rule.label} className="rt-rule" data-met={rule.met}>
                {rule.met ? (
                  <Check size={13} aria-hidden="true" />
                ) : (
                  <X size={13} aria-hidden="true" />
                )}
                {rule.label}
                <span className="rt-visually-hidden">{rule.met ? ' — met' : ' — not met'}</span>
              </li>
            ))}
          </ul>

          <div className="rt-field">
            <label htmlFor="rt-profile-confirm">Confirm new password</label>
            <input
              id="rt-profile-confirm"
              className="rt-input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={event => setConfirm(event.target.value)}
            />
          </div>

          {passwordError && (
            <p className="rt-field-error" role="alert">
              <TriangleAlert size={14} aria-hidden="true" />
              {passwordError}
            </p>
          )}
          {passwordDone && (
            <p className="rt-field-ok" role="status">
              <CircleCheck size={14} aria-hidden="true" />
              Password changed. Sessions already signed in stay signed in.
            </p>
          )}

          <button type="submit" className="rt-btn-primary" disabled={passwordBusy}>
            <KeyRound size={15} aria-hidden="true" />
            {passwordBusy ? 'Changing…' : 'Change password'}
          </button>
        </form>
      </section>
    </>
  );
}
