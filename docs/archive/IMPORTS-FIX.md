# Imports corrects (copier-coller si erreur de build)

## `src/components/FeedTab.jsx`

```jsx
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Heart,
  MessageCircle,
  Share2,
  Send,
  Image as ImageIcon,
  BarChart2,
  X,
  Pencil,
  Trash2,
  MoreHorizontal,
  Check,
} from "lucide-react";
import { FeedStories } from "./FeedStories.jsx";
import { COLORS } from "../theme.js";
import { randomId } from "../lib/id.js";
import { useToast } from "./ToastContext.jsx";
import { supabase } from "../supabaseClient.js";
import { handleDbError } from "../lib/dbErrors.js";
import { checkRateLimit, rateLimitMessage } from "../lib/rateLimit.js";
import { GuestBanner } from "./GuestBanner.jsx";
import { TranslateButton } from "./TranslateButton.jsx";
```

## `src/components/FeedStories.jsx`

```jsx
import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../supabaseClient.js";
import { StoriesBar } from "./StoriesBar.jsx";
import { StoryViewer } from "./StoryViewer.jsx";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
```

## `src/components/VideosTab.jsx`

```jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../supabaseClient.js";
import {
  Play,
  Heart,
  MessageCircle,
  Share2,
  Volume2,
  VolumeX,
  Music,
  X,
  Plus,
  Repeat2,
  Check,
  Send,
  Trash2,
} from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { StoryViewer } from "./StoryViewer.jsx";
```

## `src/app/MainShell.jsx`

```jsx
import { useState, useEffect, Suspense } from "react";
import { useApp } from "../contexts/AppContext.jsx";
import { Header } from "../components/Header.jsx";
import { Navigation } from "../components/Navigation.jsx";
import { ProfileModal } from "../features/profile/index.js";
import { NotificationDrawer } from "../components/NotificationDrawer.jsx";
import { GlobalSearchModal } from "../components/GlobalSearchModal.jsx";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";
import { OnboardingModal } from "../features/profile/index.js";
import { useApplyPendingReferral } from "../hooks/useApplyPendingReferral.js";
import { useToast } from "../components/ToastContext.jsx";
import { COLORS } from "../theme.js";
import { tabs } from "./tabs.jsx";
import { TabFallback } from "./TabFallback.jsx";
import { OfflineBanner } from "../components/OfflineBanner.jsx";
import { saveLastTab, loadLastTab } from "../lib/perf.js";
```

## UX optionnel (si tu les utilises)

```jsx
import { LazyImage, LazyVideo } from "./LazyMedia.jsx";
import { EmptyState } from "./EmptyState.jsx";
import { ConfirmDialog } from "./ConfirmDialog.jsx";
import { OfflineBanner, useOnlineStatus } from "./OfflineBanner.jsx";
import { BackBar } from "./BackBar.jsx";
import { debounce, throttle, withRetry, saveLastTab, loadLastTab } from "../lib/perf.js";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion.js";
```

## Fichiers requis sur le disque

| Import | Fichier |
|--------|---------|
| `FeedStories` | `src/components/FeedStories.jsx` |
| `OfflineBanner` | `src/components/OfflineBanner.jsx` |
| `perf.js` | `src/lib/perf.js` |
| `StoriesBar` | déjà dans le repo |
| `StoryViewer` | déjà dans le repo |

Sans ces fichiers → `Failed to resolve import`.
