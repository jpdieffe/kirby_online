"""
sprite_tool.py — Kirby Sprite Sheet Cutter
==========================================
Opens a sprite sheet image, lets you define frame boxes per action,
and exports a JSON file that kirby_sprites.js can load.

Usage:
    python sprite_tool.py

Controls:
    Click + drag on canvas  → draw a new frame box (adds to current action)
    Click an existing box   → select it (edit x/y/w/h in the sidebar)
    Mouse wheel             → zoom in/out
    Middle-click + drag     → pan the canvas
    R key                   → clear the current drag without adding a frame
"""

import json
import os
import tkinter as tk
from tkinter import ttk, messagebox, filedialog

from PIL import Image, ImageTk

# ── Constants ─────────────────────────────────────────────
DEFAULT_SHEET = os.path.join(os.path.dirname(__file__), "assets", "kirby.jpg")
OUTPUT_JSON   = os.path.join(os.path.dirname(__file__), "assets", "sprite_data.json")

ACTIONS = [
    "standing",
    "walking",
    "running",
    "sucking_in",
    "jumping_up",
    "falling_down",
    "hurt",
]

# Distinct colours for each action (for box outlines)
ACTION_COLORS = {
    "standing":    "#FF4422",
    "walking":     "#44BB22",
    "running":     "#2288FF",
    "sucking_in":  "#FF88FF",
    "jumping_up":  "#FFCC00",
    "falling_down":"#FF6600",
    "hurt":        "#CC0000",
}

SELECTED_COLOR = "#FFFFFF"
ZOOM_MIN = 0.25
ZOOM_MAX = 8.0
ZOOM_STEP = 1.25


# ── Main Application ──────────────────────────────────────
class SpriteTool(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Kirby Sprite Sheet Cutter")
        self.geometry("1300x820")
        self.resizable(True, True)

        # ── State ──────────────────────────────────────────
        # frames_data: { action: [ {x, y, w, h}, ... ] }
        self.frames_data = {a: [] for a in ACTIONS}
        self.current_action = tk.StringVar(value=ACTIONS[0])
        self.frame_count_var = tk.IntVar(value=1)
        self.bg_tolerance_var = tk.IntVar(value=30)
        self.anim_ms_var = tk.IntVar(value=700)

        self.zoom = 2.0
        self.pan_x = 0      # canvas offset (pixels at zoom=1)
        self.pan_y = 0

        self._img_orig = None   # PIL Image (original, unscaled)
        self._img_tk   = None   # PhotoImage for canvas

        self._drag_start   = None   # (canvas_x, canvas_y) where drag began
        self._drag_rect_id = None   # canvas item id of temporary drag rect
        self._selected_idx = None   # index of selected frame in current action

        self._pan_start  = None  # (event.x, event.y, pan_x, pan_y)

        self._build_ui()
        self._load_image(DEFAULT_SHEET)
        self._refresh_frame_list()

    # ── UI building ─────────────────────────────────────────
    def _build_ui(self):
        # ── Top bar ─────────────────────────────────────────
        topbar = tk.Frame(self, bg="#2a2a2a", pady=4)
        topbar.pack(side=tk.TOP, fill=tk.X)

        tk.Button(topbar, text="Open Sheet…", command=self._open_file,
                  bg="#444", fg="white", relief="flat", padx=8).pack(side=tk.LEFT, padx=6)

        tk.Label(topbar, text="Action:", bg="#2a2a2a", fg="white").pack(side=tk.LEFT, padx=(12, 2))
        action_cb = ttk.Combobox(topbar, textvariable=self.current_action,
                                 values=ACTIONS, state="readonly", width=14)
        action_cb.pack(side=tk.LEFT, padx=2)
        action_cb.bind("<<ComboboxSelected>>", lambda e: self._on_action_change())

        tk.Label(topbar, text="Expected frames:", bg="#2a2a2a", fg="white").pack(side=tk.LEFT, padx=(16, 2))
        tk.Spinbox(topbar, textvariable=self.frame_count_var, from_=1, to=64,
                   width=4, bg="#333", fg="white").pack(side=tk.LEFT)

        tk.Label(topbar, text="Zoom:", bg="#2a2a2a", fg="white").pack(side=tk.LEFT, padx=(16, 2))
        self._zoom_label = tk.Label(topbar, text=f"{self.zoom:.1f}×",
                                    bg="#2a2a2a", fg="#aaffaa", width=5)
        self._zoom_label.pack(side=tk.LEFT)
        tk.Button(topbar, text="−", command=self._zoom_out,
                  bg="#444", fg="white", relief="flat", width=2).pack(side=tk.LEFT, padx=1)
        tk.Button(topbar, text="+", command=self._zoom_in,
                  bg="#444", fg="white", relief="flat", width=2).pack(side=tk.LEFT, padx=1)
        tk.Button(topbar, text="Fit", command=self._zoom_fit,
                  bg="#444", fg="white", relief="flat", padx=4).pack(side=tk.LEFT, padx=4)

        tk.Label(topbar, text="BG tol:", bg="#2a2a2a", fg="white").pack(side=tk.LEFT, padx=(12, 2))
        tk.Spinbox(topbar, textvariable=self.bg_tolerance_var, from_=0, to=255,
                   width=4, bg="#333", fg="white").pack(side=tk.LEFT)

        tk.Label(topbar, text="Anim ms:", bg="#2a2a2a", fg="white").pack(side=tk.LEFT, padx=(12, 2))
        tk.Spinbox(topbar, textvariable=self.anim_ms_var, from_=50, to=5000, increment=50,
                   width=5, bg="#333", fg="white").pack(side=tk.LEFT)

        tk.Button(topbar, text="⬇  Export JSON", command=self._export_json,
                  bg="#226622", fg="white", relief="flat", padx=8).pack(side=tk.RIGHT, padx=8)
        tk.Button(topbar, text="▶  Preview", command=self._preview_action,
                  bg="#224466", fg="white", relief="flat", padx=8).pack(side=tk.RIGHT, padx=4)

        self._status_label = tk.Label(topbar, text="", bg="#2a2a2a", fg="#aaaaaa")
        self._status_label.pack(side=tk.RIGHT, padx=12)

        # ── Main area ────────────────────────────────────────
        main = tk.Frame(self, bg="#1e1e1e")
        main.pack(side=tk.TOP, fill=tk.BOTH, expand=True)

        # ── Left sidebar ─────────────────────────────────────
        sidebar = tk.Frame(main, bg="#252525", width=320)
        sidebar.pack(side=tk.LEFT, fill=tk.Y)
        sidebar.pack_propagate(False)

        tk.Label(sidebar, text="FRAMES", bg="#252525", fg="#888888",
                 font=("Helvetica", 9, "bold")).pack(pady=(10, 2))

        # Frame list with scrollbar
        list_frame = tk.Frame(sidebar, bg="#252525")
        list_frame.pack(fill=tk.BOTH, expand=True, padx=8, pady=4)
        scrollbar_y = tk.Scrollbar(list_frame, orient=tk.VERTICAL)
        scrollbar_y.pack(side=tk.RIGHT, fill=tk.Y)
        scrollbar_x = tk.Scrollbar(list_frame, orient=tk.HORIZONTAL)
        scrollbar_x.pack(side=tk.BOTTOM, fill=tk.X)
        self._frame_list = tk.Listbox(list_frame,
                                      yscrollcommand=scrollbar_y.set,
                                      xscrollcommand=scrollbar_x.set,
                                      bg="#1a1a1a", fg="#cccccc", selectbackground="#336633",
                                      font=("Courier", 10), activestyle="none")
        self._frame_list.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar_y.config(command=self._frame_list.yview)
        scrollbar_x.config(command=self._frame_list.xview)
        self._frame_list.bind("<<ListboxSelect>>", self._on_list_select)

        # Frame edit controls
        edit_frame = tk.LabelFrame(sidebar, text=" Edit Selected Frame ",
                                   bg="#252525", fg="#aaaaaa", padx=6, pady=6)
        edit_frame.pack(fill=tk.X, padx=8, pady=4)

        self._edit_vars = {}
        for label, key in [("X", "x"), ("Y", "y"), ("W", "w"), ("H", "h")]:
            row = tk.Frame(edit_frame, bg="#252525")
            row.pack(fill=tk.X, pady=1)
            tk.Label(row, text=f"{label}:", bg="#252525", fg="#cccccc", width=2).pack(side=tk.LEFT)
            var = tk.IntVar(value=0)
            self._edit_vars[key] = var
            spin = tk.Spinbox(row, textvariable=var, from_=0, to=4096,
                              width=6, bg="#1a1a1a", fg="white",
                              command=self._on_edit_change)
            spin.pack(side=tk.LEFT, padx=4)
            var.trace_add("write", lambda *a: self._on_edit_change())

        # Buttons
        btn_row = tk.Frame(sidebar, bg="#252525")
        btn_row.pack(fill=tk.X, padx=8, pady=4)
        tk.Button(btn_row, text="Duplicate", command=self._dup_frame,
                  bg="#334", fg="white", relief="flat").pack(side=tk.LEFT, fill=tk.X, expand=True, padx=2)
        tk.Button(btn_row, text="Delete", command=self._delete_frame,
                  bg="#522", fg="white", relief="flat").pack(side=tk.LEFT, fill=tk.X, expand=True, padx=2)

        # "Auto-grid" helper
        grid_frame = tk.LabelFrame(sidebar, text=" Auto-Grid Helper ",
                                   bg="#252525", fg="#aaaaaa", padx=6, pady=6)
        grid_frame.pack(fill=tk.X, padx=8, pady=4)

        self._grid_vars = {}
        for label, key, default in [("Start X", "gx", 0), ("Start Y", "gy", 0),
                                     ("Cell W",  "gw", 16), ("Cell H",  "gh", 16),
                                     ("Cols",    "gc", 4)]:
            row = tk.Frame(grid_frame, bg="#252525")
            row.pack(fill=tk.X, pady=1)
            tk.Label(row, text=f"{label}:", bg="#252525", fg="#cccccc", width=8, anchor="w").pack(side=tk.LEFT)
            var = tk.IntVar(value=default)
            self._grid_vars[key] = var
            tk.Spinbox(row, textvariable=var, from_=0, to=2048,
                       width=6, bg="#1a1a1a", fg="white").pack(side=tk.LEFT, padx=4)

        tk.Button(grid_frame, text="Apply Grid to Action",
                  command=self._apply_grid,
                  bg="#334466", fg="white", relief="flat").pack(fill=tk.X, pady=(4, 0))

        # ── Canvas area ──────────────────────────────────────
        canvas_frame = tk.Frame(main, bg="#111")
        canvas_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self._canvas = tk.Canvas(canvas_frame, bg="#111111",
                                 cursor="crosshair", highlightthickness=0)
        self._canvas.pack(fill=tk.BOTH, expand=True)

        # Canvas event bindings
        self._canvas.bind("<ButtonPress-1>",   self._on_drag_start)
        self._canvas.bind("<B1-Motion>",       self._on_drag_move)
        self._canvas.bind("<ButtonRelease-1>", self._on_drag_end)
        self._canvas.bind("<ButtonPress-2>",   self._on_pan_start)
        self._canvas.bind("<B2-Motion>",       self._on_pan_move)
        self._canvas.bind("<ButtonPress-3>",   self._on_pan_start)
        self._canvas.bind("<B3-Motion>",       self._on_pan_move)
        self._canvas.bind("<MouseWheel>",      self._on_scroll)
        self._canvas.bind("<Button-4>",        self._on_scroll)  # Linux
        self._canvas.bind("<Button-5>",        self._on_scroll)  # Linux
        self._canvas.bind("<Configure>",       lambda e: self._redraw())
        self.bind("<Key-r>", lambda e: self._cancel_drag())
        self.bind("<Delete>", lambda e: self._delete_frame())

    # ── Image loading ─────────────────────────────────────
    def _load_image(self, path):
        try:
            self._img_orig = Image.open(path).convert("RGBA")
            self.title(f"Kirby Sprite Sheet Cutter — {os.path.basename(path)}")
            self._zoom_fit()
        except Exception as ex:
            messagebox.showerror("Error", f"Could not load image:\n{ex}")

    def _open_file(self):
        path = filedialog.askopenfilename(
            initialdir=os.path.join(os.path.dirname(__file__), "assets"),
            title="Open Sprite Sheet",
            filetypes=[("Images", "*.png *.jpg *.jpeg *.gif *.bmp"), ("All files", "*.*")]
        )
        if path:
            self._load_image(path)

    # ── Zoom / Pan ────────────────────────────────────────
    def _zoom_in(self):
        self._set_zoom(self.zoom * ZOOM_STEP)

    def _zoom_out(self):
        self._set_zoom(self.zoom / ZOOM_STEP)

    def _zoom_fit(self):
        if not self._img_orig:
            return
        cw = self._canvas.winfo_width()  or 800
        ch = self._canvas.winfo_height() or 600
        iw, ih = self._img_orig.size
        z = min(cw / iw, ch / ih)
        self.pan_x = 0
        self.pan_y = 0
        self._set_zoom(z)

    def _set_zoom(self, z):
        self.zoom = max(ZOOM_MIN, min(ZOOM_MAX, z))
        self._zoom_label.config(text=f"{self.zoom:.2f}×")
        self._redraw()

    def _on_scroll(self, event):
        if event.num == 4 or event.delta > 0:
            self._zoom_in()
        else:
            self._zoom_out()

    def _on_pan_start(self, event):
        self._pan_start = (event.x, event.y, self.pan_x, self.pan_y)

    def _on_pan_move(self, event):
        if not self._pan_start:
            return
        sx, sy, ox, oy = self._pan_start
        self.pan_x = ox + (event.x - sx)
        self.pan_y = oy + (event.y - sy)
        self._redraw()

    # ── Canvas → image coordinate math ────────────────────
    def _to_img_coords(self, cx, cy):
        """Convert canvas pixel position to original image pixel position."""
        ix = (cx - self.pan_x) / self.zoom
        iy = (cy - self.pan_y) / self.zoom
        return ix, iy

    def _to_canvas_coords(self, ix, iy):
        """Convert original image coords to canvas pixel position."""
        cx = ix * self.zoom + self.pan_x
        cy = iy * self.zoom + self.pan_y
        return cx, cy

    # ── Drawing ───────────────────────────────────────────
    def _redraw(self):
        self._canvas.delete("all")
        if not self._img_orig:
            return

        iw, ih = self._img_orig.size
        dw = max(1, int(iw * self.zoom))
        dh = max(1, int(ih * self.zoom))

        resized = self._img_orig.resize((dw, dh), Image.NEAREST)
        self._img_tk = ImageTk.PhotoImage(resized)
        self._canvas.create_image(self.pan_x, self.pan_y, anchor="nw", image=self._img_tk)

        # Draw all frames for all actions (dimmed)
        for action, frames in self.frames_data.items():
            color = ACTION_COLORS.get(action, "#ffffff")
            for idx, f in enumerate(frames):
                is_selected = (action == self.current_action.get() and idx == self._selected_idx)
                self._draw_box(f, color, selected=is_selected,
                               label=f"{action[0].upper()}{idx}")

        # Draw temp drag rect
        if self._drag_rect_id:
            pass  # already drawn via _update_drag_rect

        # Update status
        action = self.current_action.get()
        n = len(self.frames_data[action])
        expected = self.frame_count_var.get()
        status = f"{action}: {n}/{expected} frames"
        self._status_label.config(text=status,
                                  fg="#88ff88" if n == expected else "#ffaa44")

    def _draw_box(self, f, color, selected=False, label=""):
        x1, y1 = self._to_canvas_coords(f["x"], f["y"])
        x2, y2 = self._to_canvas_coords(f["x"] + f["w"], f["y"] + f["h"])
        outline = SELECTED_COLOR if selected else color
        width   = 2 if selected else 1
        alpha_fill = "" if not selected else ""

        self._canvas.create_rectangle(x1, y1, x2, y2,
                                      outline=outline, width=width, dash=(4, 2) if not selected else None)
        if label:
            self._canvas.create_text(x1 + 2, y1 + 2, text=label,
                                     fill=outline, anchor="nw",
                                     font=("Courier", max(7, int(8 * self.zoom))))
        if selected:
            # Corner handles
            hs = 4
            for hx, hy in [(x1, y1), (x2, y1), (x1, y2), (x2, y2)]:
                self._canvas.create_rectangle(hx - hs, hy - hs, hx + hs, hy + hs,
                                              fill=SELECTED_COLOR, outline="#000")

    # ── Drag to draw frame ────────────────────────────────
    def _on_drag_start(self, event):
        # First check if clicking an existing frame box
        ix, iy = self._to_img_coords(event.x, event.y)
        action = self.current_action.get()
        frames = self.frames_data[action]
        for i in range(len(frames) - 1, -1, -1):
            f = frames[i]
            if f["x"] <= ix <= f["x"] + f["w"] and f["y"] <= iy <= f["y"] + f["h"]:
                self._selected_idx = i
                self._sync_edit_vars()
                self._frame_list.selection_clear(0, tk.END)
                self._frame_list.selection_set(i)
                self._frame_list.see(i)
                self._redraw()
                return

        # Start new drag
        self._drag_start = (event.x, event.y)
        self._selected_idx = None
        self._redraw()

    def _on_drag_move(self, event):
        if not self._drag_start:
            return
        self._update_drag_rect(event.x, event.y)

    def _update_drag_rect(self, cx, cy):
        if not self._drag_start:
            return
        self._canvas.delete("drag_rect")
        x1, y1 = self._drag_start
        x2, y2 = cx, cy
        outline_color = "#000000" if self._is_light_bg() else "#ffffff"
        self._drag_rect_id = self._canvas.create_rectangle(
            min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2),
            outline=outline_color, width=2, dash=(6, 2), tags="drag_rect"
        )

    def _on_drag_end(self, event):
        if not self._drag_start:
            return
        sx, sy = self._drag_start
        ex, ey = event.x, event.y
        self._drag_start = None
        self._canvas.delete("drag_rect")

        # Ignore tiny accidental clicks
        if abs(ex - sx) < 4 and abs(ey - sy) < 4:
            return

        ix1, iy1 = self._to_img_coords(min(sx, ex), min(sy, ey))
        ix2, iy2 = self._to_img_coords(max(sx, ex), max(sy, ey))

        frame = {
            "x": max(0, int(round(ix1))),
            "y": max(0, int(round(iy1))),
            "w": max(1, int(round(ix2 - ix1))),
            "h": max(1, int(round(iy2 - iy1))),
        }

        action = self.current_action.get()
        self.frames_data[action].append(frame)
        self._selected_idx = len(self.frames_data[action]) - 1
        self._refresh_frame_list()
        self._sync_edit_vars()
        self._redraw()

    def _cancel_drag(self):
        self._drag_start = None
        self._canvas.delete("drag_rect")

    # ── Frame list ─────────────────────────────────────────
    def _refresh_frame_list(self):
        action = self.current_action.get()
        frames = self.frames_data[action]
        self._frame_list.delete(0, tk.END)
        for i, f in enumerate(frames):
            flag = "  !!" if f['w'] == 0 or f['h'] == 0 else ""
            self._frame_list.insert(tk.END,
                f" {i:2d}  x={f['x']:4d}  y={f['y']:4d}  w={f['w']:3d}  h={f['h']:3d}{flag}")
        if self._selected_idx is not None and self._selected_idx < len(frames):
            self._frame_list.selection_set(self._selected_idx)
            self._frame_list.see(self._selected_idx)

    def _on_list_select(self, event):
        sel = self._frame_list.curselection()
        if sel:
            self._selected_idx = sel[0]
            self._sync_edit_vars()
            self._redraw()

    def _on_action_change(self):
        self._selected_idx = None
        self._refresh_frame_list()
        self._redraw()

    # ── Edit spinboxes ──────────────────────────────────────
    def _sync_edit_vars(self):
        """Push selected frame values into the spinbox vars."""
        action = self.current_action.get()
        frames = self.frames_data[action]
        if self._selected_idx is not None and self._selected_idx < len(frames):
            f = frames[self._selected_idx]
            self._editing = True          # block trace-back while we set all 4
            for key in ("x", "y", "w", "h"):
                self._edit_vars[key].set(f[key])
            self._editing = False

    _editing = False

    def _on_edit_change(self):
        if self._editing:
            return
        action = self.current_action.get()
        frames = self.frames_data[action]
        if self._selected_idx is None or self._selected_idx >= len(frames):
            return
        try:
            f = frames[self._selected_idx]
            for key in ("x", "y", "w", "h"):
                f[key] = self._edit_vars[key].get()
            self._refresh_frame_list()
            self._redraw()
        except Exception:
            pass

    # ── Frame manipulation ─────────────────────────────────
    def _delete_frame(self):
        action = self.current_action.get()
        frames = self.frames_data[action]
        if self._selected_idx is not None and self._selected_idx < len(frames):
            frames.pop(self._selected_idx)
            self._selected_idx = min(self._selected_idx, len(frames) - 1) if frames else None
            self._refresh_frame_list()
            self._redraw()

    def _dup_frame(self):
        action = self.current_action.get()
        frames = self.frames_data[action]
        if self._selected_idx is not None and self._selected_idx < len(frames):
            f = dict(frames[self._selected_idx])
            frames.insert(self._selected_idx + 1, f)
            self._selected_idx += 1
            self._refresh_frame_list()
            self._sync_edit_vars()
            self._redraw()

    # ── Auto-grid helper ───────────────────────────────────
    def _apply_grid(self):
        gx = self._grid_vars["gx"].get()
        gy = self._grid_vars["gy"].get()
        gw = self._grid_vars["gw"].get()
        gh = self._grid_vars["gh"].get()
        gc = self._grid_vars["gc"].get()
        n  = self.frame_count_var.get()

        if messagebox.askyesno("Apply Grid",
                               f"Replace all {self.current_action.get()} frames with {n} "
                               f"auto-grid cells ({gw}×{gh} starting at {gx},{gy}, {gc} cols)?"):
            action = self.current_action.get()
            self.frames_data[action] = []
            for i in range(n):
                col = i % gc
                row = i // gc
                self.frames_data[action].append({
                    "x": gx + col * gw,
                    "y": gy + row * gh,
                    "w": gw,
                    "h": gh,
                })
            self._selected_idx = None
            self._refresh_frame_list()
            self._redraw()

    # ── Background detection & frame processing ─────────────
    def _detect_bg_color(self):
        """Sample corners + edges of the sheet to find the background colour."""
        if not self._img_orig:
            return (255, 255, 255, 255)
        img = self._img_orig
        w, h = img.size
        # Sample 12 points around edges for a robust estimate
        samples = [
            (0, 0), (w // 4, 0), (w // 2, 0), (3 * w // 4, 0), (w - 1, 0),
            (0, h - 1), (w // 4, h - 1), (w // 2, h - 1), (w - 1, h - 1),
            (0, h // 4), (0, h // 2), (w - 1, h // 2),
        ]
        pixels = [img.getpixel((min(max(sx, 0), w - 1), min(max(sy, 0), h - 1))) for sx, sy in samples]
        r = sum(c[0] for c in pixels) // len(pixels)
        g = sum(c[1] for c in pixels) // len(pixels)
        b = sum(c[2] for c in pixels) // len(pixels)
        return (r, g, b, 255)

    def _is_light_bg(self):
        """True when background luminance > 128 (i.e. white-ish sheet)."""
        bg = self._detect_bg_color()
        lum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2]
        return lum > 128

    def _process_frame(self, f, tolerance=None):
        """
        Crop frame, remove background colour within `tolerance`, then
        centre the non-transparent content within the original crop size.
        Returns an RGBA PIL Image.
        """
        if tolerance is None:
            tolerance = self.bg_tolerance_var.get()
        if not self._img_orig:
            return None
        img = self._img_orig
        iw, ih = img.size
        x = max(0, f["x"])
        y = max(0, f["y"])
        w = min(f["w"], iw - x)
        h = min(f["h"], ih - y)
        if w <= 0 or h <= 0:
            return None

        crop = img.crop((x, y, x + w, y + h)).convert("RGBA")

        # Detect BG from this specific crop's corners (more reliable than full-sheet)
        cpx = crop.load()
        corner_samples = [
            cpx[0, 0], cpx[w - 1, 0],
            cpx[0, h - 1], cpx[w - 1, h - 1]
        ]
        bg_r = sum(c[0] for c in corner_samples) // 4
        bg_g = sum(c[1] for c in corner_samples) // 4
        bg_b = sum(c[2] for c in corner_samples) // 4

        # Remove background pixels
        tol_sq = tolerance * tolerance  # compare squared to avoid sqrt per pixel
        for py in range(h):
            for px in range(w):
                r, g, b, a = cpx[px, py]
                dist_sq = (r - bg_r) ** 2 + (g - bg_g) ** 2 + (b - bg_b) ** 2
                if dist_sq <= tol_sq:
                    cpx[px, py] = (0, 0, 0, 0)

        # Tight bbox of remaining opaque content
        bbox = crop.getbbox()
        if bbox is None:
            return crop  # nothing visible

        content_w = bbox[2] - bbox[0]
        content_h = bbox[3] - bbox[1]
        content = crop.crop(bbox)

        # Centre content within original crop dimensions
        out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        paste_x = (w - content_w) // 2
        paste_y = (h - content_h) // 2
        out.paste(content, (paste_x, paste_y))
        return out

    # ── Export ─────────────────────────────────────────────
    def _export_json(self):
        path = filedialog.asksaveasfilename(
            initialfile="sprite_data.json",
            initialdir=os.path.join(os.path.dirname(__file__), "assets"),
            defaultextension=".json",
            filetypes=[("JSON", "*.json"), ("All files", "*.*")]
        )
        if not path:
            return

        # Raw frame coordinates
        with open(path, "w") as fh:
            json.dump(self.frames_data, fh, indent=2)

        # Processed PNGs → assets/sprites/<action>_<idx>.png
        sprites_dir = os.path.join(os.path.dirname(path), "sprites")
        os.makedirs(sprites_dir, exist_ok=True)
        count = 0
        for action, frames in self.frames_data.items():
            for idx, f in enumerate(frames):
                processed = self._process_frame(f)
                if processed:
                    out_path = os.path.join(sprites_dir, f"{action}_{idx:02d}.png")
                    processed.save(out_path)
                    count += 1

        messagebox.showinfo(
            "Exported",
            f"JSON saved to:\n{path}\n\n"
            f"{count} processed PNGs saved to:\n{sprites_dir}\\"
        )
        self._status_label.config(
            text=f"Exported {count} frames → sprites/", fg="#88ff88"
        )

    # ── Preview ────────────────────────────────────────────
    def _preview_action(self):
        action = self.current_action.get()
        frames = self.frames_data[action]
        if not frames:
            messagebox.showinfo("Preview", f"No frames defined for '{action}'.")
            return

        processed_pairs = [(f, self._process_frame(f)) for f in frames]
        bad = [i for i, (f, p) in enumerate(processed_pairs)
               if p is None or f['w'] == 0 or f['h'] == 0]
        processed = [p for (_, p) in processed_pairs if p is not None]
        if not processed:
            details = ", ".join(str(i) for i in bad)
            bad_dims = [(i, frames[i]['w'], frames[i]['h']) for i in bad]
            dim_str = "  ".join(f"frame {i}: w={w} h={h}" for i, w, h in bad_dims)
            messagebox.showerror(
                "Preview — Bad Frames",
                f"No frames could be processed. {len(bad)} frame(s) have zero or invalid dimensions:\n\n"
                f"{dim_str}\n\nFix using the W/H spinboxes in the sidebar, or re-draw the boxes."
            )
            return

        # Trim dead space from each frame, then pad to uniform size (centered)
        trimmed = []
        for p in processed:
            bbox = p.getbbox()
            if bbox:
                trimmed.append(p.crop(bbox))
            else:
                trimmed.append(p)  # fully transparent — keep as-is

        # Uniform canvas = max trimmed dimensions across all frames
        max_w = max(t.width  for t in trimmed)
        max_h = max(t.height for t in trimmed)

        # Re-center each trimmed frame onto the uniform canvas
        uniform = []
        for t in trimmed:
            canvas_img = Image.new("RGBA", (max_w, max_h), (0, 0, 0, 0))
            px = (max_w - t.width)  // 2
            py = (max_h - t.height) // 2
            canvas_img.paste(t, (px, py), t)
            uniform.append(canvas_img)
        processed = uniform
        # Scale up small sprites so they're visible (target ~200 px)
        scale = max(1, min(12, 200 // max(max_w, max_h, 1)))
        disp_w = max_w * scale
        disp_h = max_h * scale

        win = tk.Toplevel(self)
        win.title(f"Preview — {action}")
        win.configure(bg="#111111")
        win.resizable(False, False)

        tk.Label(win,
                 text=f"{action}   {len(processed)} frames   {max_w}×{max_h} px   (×{scale} zoom)",
                 bg="#111111", fg="#888888", font=("Helvetica", 9)
                 ).pack(pady=(10, 2))

        cv = tk.Canvas(win, width=disp_w, height=disp_h,
                       bg="#222222", highlightthickness=1, highlightbackground="#444")
        cv.pack(padx=24, pady=8)

        frame_lbl = tk.Label(win, text="Frame 0", bg="#111111", fg="#aaaaaa",
                             font=("Courier", 10))
        frame_lbl.pack(pady=(0, 12))

        # Build checker background once
        sq = 8
        checker = Image.new("RGBA", (disp_w, disp_h))
        cpx = checker.load()
        for py in range(disp_h):
            for px in range(disp_w):
                cpx[px, py] = (50, 50, 50, 255) if (px // sq + py // sq) % 2 == 0 \
                              else (80, 80, 80, 255)

        # Pre-render PhotoImages
        photos = []
        for img in processed:
            scaled = img.resize((disp_w, disp_h), Image.NEAREST)
            comp = checker.copy()
            comp.paste(scaled, (0, 0), scaled)
            photos.append(ImageTk.PhotoImage(comp))

        state = {"idx": 0, "alive": True}

        def tick():
            if not state["alive"]:
                return
            i = state["idx"]
            cv.delete("all")
            cv.create_image(0, 0, anchor="nw", image=photos[i])
            frame_lbl.config(text=f"Frame {i} / {len(photos) - 1}")
            state["idx"] = (i + 1) % len(photos)
            win.after(self.anim_ms_var.get(), tick)

        win.protocol("WM_DELETE_WINDOW", lambda: (state.update(alive=False), win.destroy()))
        tick()


# ── Entry point ───────────────────────────────────────────
if __name__ == "__main__":
    app = SpriteTool()
    app.mainloop()
