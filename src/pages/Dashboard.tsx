import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "../api";
import { useAuth } from "../auth";
import { buildGreeting, addressName } from "../greeting";
import { Modal, Spinner, useToast } from "../ui";
import { Icon, type IconName } from "../components/Icon";
import { WIDGET_CATALOG, WIDGET_DEFS, WidgetContent } from "../widgets";
import type { Widget, WidgetSize } from "@shared/types";

function SortableWidget({
  widget,
  editing,
  onRemove,
  onResize,
}: {
  widget: Widget;
  editing: boolean;
  onRemove: (id: string) => void;
  onResize: (id: string, size: WidgetSize) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  const def = WIDGET_DEFS[widget.type];
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className={`widget size-${widget.size}${isDragging ? " dragging" : ""}`}>
      <div className="widget-head">
        <span style={{ color: "var(--accent-ink)", display: "inline-flex" }}>
          <Icon name={(def?.icon as IconName) ?? "sparkle"} size={18} />
        </span>
        <span className="widget-title">{widget.title || def?.name || widget.type}</span>
        {editing ? (
          <div className="row gap-2">
            <select
              className="select"
              style={{ width: "auto", padding: "2px 6px", fontSize: "0.75rem" }}
              value={widget.size}
              onChange={(e) => onResize(widget.id, e.target.value as WidgetSize)}
            >
              <option value="sm">S</option>
              <option value="md">M</option>
              <option value="lg">L</option>
            </select>
            <button className="btn btn-icon btn-soft btn-sm" {...attributes} {...listeners} aria-label="Déplacer"><Icon name="dots" size={15} /></button>
            <button className="btn btn-icon btn-danger btn-sm" onClick={() => onRemove(widget.id)} aria-label="Retirer"><Icon name="close" size={15} /></button>
          </div>
        ) : null}
      </div>
      <WidgetContent type={widget.type} config={widget.config} />
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["widgets"], queryFn: () => api.widgets() });
  const widgets = data?.widgets ?? [];

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.reorderWidgets(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["widgets"] }),
  });
  const add = useMutation({
    mutationFn: (type: string) => api.addWidget(type),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["widgets"] });
      toast.push("Widget ajouté");
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.removeWidget(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["widgets"] }),
  });
  const resize = useMutation({
    mutationFn: ({ id, size }: { id: string; size: WidgetSize }) => api.updateWidget(id, { size }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["widgets"] }),
  });
  const seed = useMutation({
    mutationFn: async () => {
      await api.seedStarter().catch(() => {});
      for (const t of ["lists", "trips", "events", "notes", "expenses"]) await api.addWidget(t).catch(() => {});
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.push("Ton espace est prêt");
    },
  });

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = widgets.findIndex((w) => w.id === active.id);
    const newIndex = widgets.findIndex((w) => w.id === over.id);
    const next = arrayMove(widgets, oldIndex, newIndex);
    qc.setQueryData(["widgets"], { widgets: next });
    reorder.mutate(next.map((w) => w.id));
  };

  const greeting = buildGreeting(user);

  return (
    <div>
      <div className="page-head row wrap" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow">Ton atelier</p>
          <h1>{greeting.text}{greeting.emoji ? ` ${greeting.emoji}` : ""}</h1>
          <p className="muted">Tout ce que tu gardes, planifies et partages, au même endroit.</p>
        </div>
        <div className="row gap-2">
          <button className="btn btn-soft" onClick={() => setEditing((v) => !v)}>
            <Icon name={editing ? "check" : "edit"} size={16} /> {editing ? "Terminé" : "Personnaliser"}
          </button>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Ajouter</button>
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : widgets.length === 0 ? (
        <div className="card">
          <div className="empty">
            <span className="empty-icon"><Icon name="sparkle" size={34} strokeWidth={1.6} /></span>
            <h3>Bienvenue dans ton atelier, {addressName(user)}</h3>
            <p className="muted">Démarre en un clic : on te prépare quelques listes, une note et un week-end à imaginer, puis tu personnalises tout.</p>
            <div className="row gap-2 wrap" style={{ justifyContent: "center", marginTop: "var(--space-4)" }}>
              <button className="btn btn-primary" onClick={() => seed.mutate()} disabled={seed.isPending}>
                <Icon name="sparkle" size={16} /> {seed.isPending ? "Préparation…" : "Démarrer mon espace"}
              </button>
              <button className="btn btn-soft" onClick={() => setAdding(true)}>
                <Icon name="plus" size={16} /> Choisir mes widgets
              </button>
            </div>
          </div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
            <div className="widget-grid">
              {widgets.map((w) => (
                <SortableWidget
                  key={w.id}
                  widget={w}
                  editing={editing}
                  onRemove={(id) => remove.mutate(id)}
                  onResize={(id, size) => resize.mutate({ id, size })}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {adding && (
        <Modal title="Ajouter un widget" onClose={() => setAdding(false)} wide>
          <div className="grid-cards">
            {WIDGET_CATALOG.map((w) => (
              <button
                key={w.type}
                className="card card-pad-sm"
                style={{ textAlign: "left", cursor: "pointer" }}
                onClick={() => { add.mutate(w.type); setAdding(false); }}
              >
                <div style={{ color: "var(--accent-ink)" }}><Icon name={(w.icon as IconName) ?? "sparkle"} size={26} /></div>
                <strong>{w.name}</strong>
                <p className="muted small">{w.description}</p>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
