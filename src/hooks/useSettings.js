import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabaseClient.js";
import {
  applySettingsToDom,
  saveLocalSettings,
  loadLocalSettings,
  saveCloudSettings,
  DEFAULT_SETTINGS,
} from "../lib/appSettings.js";
