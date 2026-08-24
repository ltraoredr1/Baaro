/**
 * Snippets à intégrer dans MainShell.jsx (ne pas remplacer le fichier entier).
 *
 * 1) Imports :
 *    import { OfflineBanner } from "../components/OfflineBanner.jsx";
 *    import { saveLastTab, loadLastTab } from "../lib/perf.js";
 *
 * 2) État onglet :
 *    const [activeTab, setActiveTab] = useState(() => loadLastTab("feed"));
 *
 * 3) Persistance :
 *    useEffect(() => {
 *      saveLastTab(activeTab);
 *    }, [activeTab]);
 *
 * 4) Dans le JSX, juste après <div ... themeBg> :
 *    <OfflineBanner />
 *
 * 5) Sur <main> :
 *    <main id="main-content" className="md:col-span-3 mobile-nav-spacer" tabIndex={-1}>
 *
 * 6) setActiveTab stable pour Navigation — optionnel :
 *    const goTab = useCallback((id) => setActiveTab(id), []);
 */

export default null;
