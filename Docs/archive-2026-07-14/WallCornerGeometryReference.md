Corner Type Reference (debug-color key: 🟧 = face | 🟩 = H-cap | 🟦 = V-cap)
The perimeter above shows all 4 in context — here is what each one is and where it lives on screen:

          corner-br          corner-bl
         (upper-left)      (upper-right)
              ┌────────────────┐
              │                │
              │   INSIDE       │
              │   PERIMETER    │
              └────────────────┘
         corner-tr          corner-tl
         (lower-left)      (lower-right)


corner-tl — arms go: top (NW) + left (SW) = "inner corner facing camera"
→ lives at lower-right of a perimeter box

The L-shape opens toward the SE (toward you). You see: wide south face + narrow east face.

corner-tr — arms go: top (NW) + right (NE) = "inner corner facing away-left"
→ lives at lower-left of a perimeter box

corner-bl — arms go: bottom (SE) + left (SW) = "inner corner facing away-right"
→ lives at upper-right of a perimeter box

corner-br — arms go: bottom (SE) + right (NE) = "outer corner facing camera" ← most problemati
→ lives at upper-left of a perimeter box

The V-shape: both walls run away from you. You see both faces, creating the dark-void gap between them.