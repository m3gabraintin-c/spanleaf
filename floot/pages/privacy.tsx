import { Link } from "react-router-dom";
import { LegalPage } from "../components/LegalPage";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="10 October 2026">
      <p>
        The short version: your photos, videos, words and projects stay on your device. Two things you choose to use send something off it: the AI collage shuffle sends small copies of your photos to an AI service, and a share
        link puts pictures of your slides on our server so others can see them. There are no accounts and nothing to sign up for.
      </p>

      <h2>What stays on your device</h2>
      <p>
        Everything you make in Spanleaf is kept in your own browser's storage (IndexedDB) on the device you are using. That includes photos, videos, text, drawings and project names. It is not sent to us or to anyone else. Because of
        this, a project only opens in the browser where you made it, and clearing your browser's site data deletes it. Exported pictures and videos are saved straight to your device.
      </p>
      <p>Your choice of light or dark mode is kept in your browser too, so it is remembered next time.</p>

      <h2>Making your own stickers</h2>
      <p>
        When you make a sticker, the background is taken away on your device, by a small model that runs in your browser. The picture is not sent anywhere. The first time, your browser downloads the model from this site and the
        program that runs it from jsDelivr, a public code host, which sees your IP address like any website you load something from. Stickers you make are kept in your browser under My stickers.
      </p>

      <h2>The AI collage shuffle</h2>
      <p>
        When you press Shuffle collage with "AI picks the tilts and stickers" switched on, small copies of your photos (at most 192 pixels across, so faces and details are blurry) are sent through Floot to OpenAI, which looks at them
        and replies with which photos to tilt and where to put tape and flowers. We use the copies only to answer that request and don't keep them; OpenAI handles them under its own rules for API data. Nothing else, such as your words or project names, is sent. Switch it off and the shuffle works entirely
        on your device with a random look instead.
      </p>

      <h2>What we count</h2>
      <h2>Share links</h2>
      <p>
        When you press Make a link in Export, pictures of your slides (up to 30, about 810 pixels wide) and the project name are uploaded to Spanleaf's storage on Floot's hosting, and you get a link. Anyone who has the link can
        see those pictures and the project name, and can leave comments with a name they type in. Comments are kept with the link and shown to everyone who opens it.
      </p>
      <p>
        A link, its pictures and its comments are deleted after 30 days, or straight away when you press Delete for that link in Export. The secret that lets you delete it is kept in your browser; we only keep a scrambled form of
        it. To stop one connection making very many links, we count links per day against a scrambled form of your network address, never the address itself. The link pages ask search engines not to list them.
      </p>
      <p>Commenters: the name you type is remembered in your browser so you don't have to type it again.</p>

      <h2>What we count</h2>
      <p>
        Spanleaf is hosted on Floot, which counts visits to help us see how the app is used. For each page view it records the page address, the website you came from, your browser type, your browser language and a rough country
        worked out from your time zone. It does not record your IP address. The visit is grouped by a random session number that is kept only in memory while the page is open, so nothing is stored on your device for this and no cookie
        is set.
      </p>
      <p>
        We also count a few actions: creating or opening a project, adding a video, shuffling the collage, and exporting. These counts carry only numbers such as how many slides were exported and in what format. They never include your
        photos, videos, words, file names or project names.
      </p>

      <h2>What we don't do</h2>
      <ul>
        <li>We don't sell or share any information about you.</li>
        <li>We don't use advertising trackers.</li>
        <li>We can't see, recover or delete your projects, because we never have them. The small copies sent for the AI shuffle aren't kept by us. Share links hold only the slide pictures, the name and the comments, and only until they expire or you delete them.</li>
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
