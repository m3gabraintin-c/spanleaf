import { Link } from "react-router-dom";
import { LegalPage } from "../components/LegalPage";

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="8 October 2026">
      <p>Spanleaf is a free tool for making photo carousels. By using it you agree to these terms.</p>

      <h2>It's free</h2>
      <p>Every feature is free. There are no plans, payments or trials.</p>

      <h2>Your work is yours</h2>
      <p>
        You keep all rights to the photos, videos and words you use and to the pictures you export. We don't claim any of it. Exports have no watermark. Your projects are stored only in your browser (see{" "}
        <Link to="/privacy">privacy</Link>), so keeping copies of anything important is up to you.
      </p>

      <h2>Use it fairly</h2>
      <p>Only use photos, videos and words you have the right to use, and don't use Spanleaf to make anything illegal or to harm anyone.</p>

      <h2>No guarantees</h2>
      <p>
        Spanleaf is provided as it is. We work to keep it running and to avoid losing work, but we can't promise it will always be available or free of mistakes, and we aren't responsible for projects lost when browser storage is
        cleared or full. As far as the law allows, we aren't liable for losses from using it.
      </p>

      <h2>Changes</h2>
      <p>We may change the app or these terms. The current terms will always be on this page with the date they last changed.</p>
    </LegalPage>
  );
}
