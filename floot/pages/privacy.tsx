import { Link } from "react-router-dom";
import { LegalPage } from "../components/LegalPage";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="8 October 2026">
      <p>The short version: your photos, videos, words and projects never leave your device. There are no accounts and nothing to sign up for.</p>

      <h2>What stays on your device</h2>
      <p>
        Everything you make in Spanleaf is kept in your own browser's storage (IndexedDB) on the device you are using. That includes photos, videos, text, drawings and project names. It is not sent to us or to anyone else. Because of
        this, a project only opens in the browser where you made it, and clearing your browser's site data deletes it. Exported pictures and videos are saved straight to your device.
      </p>
      <p>Your choice of light or dark mode is kept in your browser too, so it is remembered next time.</p>

      <h2>What we count</h2>
      <p>
        Spanleaf is hosted on Floot, which counts visits to help us see how the app is used. For each page view it records the page address, the website you came from, your browser type, your browser language and a rough country
        worked out from your time zone. It does not record your IP address. The visit is grouped by a random session number that is kept only in memory while the page is open, so nothing is stored on your device for this and no cookie
        is set.
      </p>
      <p>
        We also count a few actions: opening a project, adding a video, and exporting. These counts carry only numbers such as how many slides were exported and in what format. They never include your photos, videos, words, file names
        or project names.
      </p>

      <h2>What we don't do</h2>
      <ul>
        <li>We don't sell or share any information about you.</li>
        <li>We don't use advertising trackers.</li>
        <li>We can't see, recover or delete your projects, because we never have them.</li>
      </ul>

      <h2>Fonts</h2>
      <p>The app's fonts are loaded from Google Fonts, which receives your IP address when it sends them, as it does for any website that uses it.</p>

      <h2>Changes and questions</h2>
      <p>
        If this changes, the new version will be on this page with a new date. See also the <Link to="/terms">terms</Link>.
      </p>
    </LegalPage>
  );
}
