"use client";

import { useActionState, useCallback, useEffect, useState, useTransition } from "react";
import { Pencil, Plus, Stethoscope, X, ImagePlus } from "lucide-react";
import type { DataResult, SpecialtyRow } from "@/lib/portal-data";
import { createSpecialtyAction, deleteSpecialtyAction, removeSpecialtyPhotoAction, updateSpecialtyAction, uploadSpecialtyPhotoAction, type SpecialtyActionState } from "@/app/(admin)/admin/specialties/actions";
import { UnavailableState } from "@/components/unavailable-state";

const EMPTY: SpecialtyActionState = {};

export function AdminSpecialtyManager({ result }: { result: DataResult<SpecialtyRow[]> }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const closeEditor = useCallback(() => setEditingId(null), []);
  if (result.unavailable || !result.data) return <UnavailableState detail="Specialties could not be loaded from the CareNow API." />;
  const items = result.data;
  const editingItem = editingId ? items.find((item) => item.id === editingId) ?? null : null;
  return <>
    <div className="page-heading"><p className="step-hint">Inactive specialties remain on existing doctor profiles but are removed from registration choices.</p><button type="button" className="button" onClick={() => { setShowCreate((value) => !value); setEditingId(null); }}><Plus size={15} />{showCreate ? "Close form" : "Add specialty"}</button></div>
    {showCreate && <SpecialtyForm />}
    <section className="card admin-slots-card"><header className="card-header"><div><h2>Specialty catalog</h2><span className="step-hint">{items.length} total</span></div></header>
      {items.length ? <div className="table-wrap"><table className="admin-slot-table"><thead><tr><th>Specialty</th><th>Doctors</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {items.map((item) => <tr key={item.id}>
          <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}>{item.photoUrl ? <img src={item.photoUrl} alt="" width={44} height={44} style={{ borderRadius: 9, objectFit: "cover" }} /> : <div className="empty-icon" aria-hidden="true"><Stethoscope size={18} /></div>}<strong>{item.name}</strong></div></td><td>{item.doctorCount}</td><td><span className={`status-pill ${item.isActive ? "progress" : "waiting"}`}>{item.isActive ? "Active" : "Inactive"}</span></td>
          <td><div className="slot-actions"><button className="button secondary small" type="button" onClick={() => { setEditingId(item.id); setShowCreate(false); }}><Pencil size={13} />Edit</button>{item.doctorCount === 0 && <DeleteButton item={item} />}</div></td>
        </tr>)}
      </tbody></table></div> : <div className="empty-state"><div className="empty-icon"><Stethoscope size={19} /></div><strong>No specialties yet</strong><p>Add a specialty to make it available in doctor registration.</p></div>}
    </section>
    {editingItem && <SpecialtyEditDialog item={editingItem} onClose={closeEditor} />}
  </>;
}

function SpecialtyEditDialog({ item, onClose }: { item: SpecialtyRow; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [onClose]);

  return <div className="specialty-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="specialty-modal" role="dialog" aria-modal="true" aria-label={`Edit ${item.name}`}>
      <SpecialtyForm item={item} onCancel={onClose} />
    </section>
  </div>;
}

function SpecialtyForm({ item, onCancel }: { item?: SpecialtyRow; onCancel?: () => void }) {
  const actionCreator = item ? updateSpecialtyAction.bind(null, item.id) : createSpecialtyAction;
  const [state, action, pending] = useActionState(actionCreator, EMPTY);
  return <>
    <form action={action} className="card slot-form"><header className="card-header"><div><h2>{item ? "Edit specialty" : "Add specialty"}</h2><span className="step-hint">Use a clear, patient-friendly label.</span></div>{onCancel && <button className="button secondary small" type="button" onClick={onCancel}><X size={13} />Cancel</button>}</header>
      <div className="slot-fields"><label className="form-field"><span>Name</span><input name="name" required minLength={2} maxLength={100} defaultValue={item?.name} /></label>{item && <label className="terms-check"><input type="checkbox" name="isActive" defaultChecked={item.isActive} /><span>Active and available in registration</span></label>}</div>
      {state.error && <p className="auth-error" role="alert">{state.error}</p>}{state.success && <p className="doctor-action-success" role="status">{state.success}</p>}
      <div className="slot-form-footer"><button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : item ? "Save changes" : "Create specialty"}</button></div>
    </form>
    {item && <SpecialtyPhotoControls item={item} />}
  </>;
}

function SpecialtyPhotoControls({ item }: { item: SpecialtyRow }) {
  const [uploadState, uploadAction, uploading] = useActionState(uploadSpecialtyPhotoAction.bind(null, item.id), EMPTY);
  const [removeState, removeAction, removing] = useActionState(removeSpecialtyPhotoAction.bind(null, item.id), EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [horizontal, setHorizontal] = useState(50);
  const [vertical, setVertical] = useState(50);
  const [cropError, setCropError] = useState("");
  const [cropping, startCropping] = useTransition();
  const previewSize = 220;

  useEffect(() => {
    if (!file) { setPreviewUrl(null); setDimensions(null); return; }
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = url;
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const scale = dimensions ? Math.max(previewSize / dimensions.width, previewSize / dimensions.height) * zoom : 1;
  const scaledWidth = dimensions ? dimensions.width * scale : previewSize;
  const scaledHeight = dimensions ? dimensions.height * scale : previewSize;

  async function submitPhoto(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) { setCropError("Choose a photo first."); return; }
    setCropError("");
    try {
      const cropped = await cropSquareImage(file, zoom, horizontal, vertical);
      const formData = new FormData();
      formData.set("photo", cropped, "specialty-photo.jpg");
      startCropping(() => uploadAction(formData));
    } catch {
      setCropError("We could not prepare this image. Try a different photo.");
    }
  }

  return <div className="slot-form" style={{ marginTop: 16 }}><h3>Specialty photo</h3><p className="step-hint">Shown with this specialty in the patient app. Select an image, adjust the square crop, then upload. The image is resized before upload.</p>{item.photoUrl && <img src={item.photoUrl} alt={`${item.name} specialty`} width={96} height={72} style={{ borderRadius: 10, objectFit: "cover" }} />}
    <form onSubmit={submitPhoto} className="specialty-photo-form"><label className="form-field"><span>Choose image</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => { setFile(event.currentTarget.files?.[0] ?? null); setZoom(1); setHorizontal(50); setVertical(50); setCropError(""); }} /></label>
      {file && previewUrl && <div className="specialty-crop-editor">
        <div className="specialty-crop-preview" aria-label="Square crop preview">
          <img src={previewUrl} alt="Crop preview" onLoad={(event) => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} style={{ position: "absolute", maxWidth: "none", width: scaledWidth, height: scaledHeight, left: -((scaledWidth - previewSize) * horizontal / 100), top: -((scaledHeight - previewSize) * vertical / 100) }} />
        </div>
        <div className="specialty-crop-controls">
          <strong>Adjust crop</strong>
          <label className="form-field"><span>Zoom ({zoom.toFixed(1)}×)</span><input type="range" min="1" max="3" step="0.1" value={zoom} onChange={(event) => setZoom(Number(event.currentTarget.value))} /></label>
          <label className="form-field"><span>Horizontal crop</span><input type="range" min="0" max="100" value={horizontal} onChange={(event) => setHorizontal(Number(event.currentTarget.value))} /></label>
          <label className="form-field"><span>Vertical crop</span><input type="range" min="0" max="100" value={vertical} onChange={(event) => setVertical(Number(event.currentTarget.value))} /></label>
        </div>
      </div>}
      {cropError && <p className="auth-error" role="alert">{cropError}</p>}{uploadState.error && <p className="auth-error" role="alert">{uploadState.error}</p>}{uploadState.success && <p className="doctor-action-success" role="status">{uploadState.success}</p>}
      <button type="submit" className="button secondary" disabled={uploading || cropping || !file}><ImagePlus size={14} />{cropping ? "Preparing image…" : uploading ? "Uploading…" : "Upload photo"}</button>
    </form>
    {item.photoUrl && <form action={removeAction} style={{ marginTop: 8 }}><button type="submit" className="button danger small" disabled={removing}>{removing ? "Removing…" : "Remove photo"}</button>{removeState.error && <span className="slot-inline-error" role="alert">{removeState.error}</span>}{removeState.success && <span className="slot-inline-success" role="status">{removeState.success}</span>}</form>}
  </div>;
}

async function cropSquareImage(file: File, zoom: number, horizontal: number, vertical: number): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("INVALID_IMAGE"));
      element.src = objectUrl;
    });
    const side = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
    const sourceX = (image.naturalWidth - side) * horizontal / 100;
    const sourceY = (image.naturalHeight - side) * vertical / 100;
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 768;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    context.drawImage(image, sourceX, sourceY, side, side, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("IMAGE_ENCODING_FAILED")), "image/jpeg", 0.9));
    return new File([blob], "specialty-photo.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function DeleteButton({ item }: { item: SpecialtyRow }) {
  const [state, action, pending] = useActionState(deleteSpecialtyAction.bind(null, item.id), EMPTY);
  return <form action={action} onSubmit={(event) => { if (!window.confirm(`Delete ${item.name}?`)) event.preventDefault(); }}><button className="button danger small" type="submit" disabled={pending}>{pending ? "Deleting…" : "Delete"}</button>{state.error && <span className="slot-inline-error" role="alert">{state.error}</span>}{state.success && <span className="slot-inline-success" role="status">{state.success}</span>}</form>;
}
