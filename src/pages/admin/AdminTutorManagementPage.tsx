import InviteTutorForm from "../../components/admin/InviteTutorForm";
import TutorList from "../../components/admin/TutorList";

// Admin screen: invite tutors and manage the existing roster. Lives at
// /admin/tutors. Both panels react in realtime via the useTutors listener.
export default function AdminTutorManagementPage() {
  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>Tutor Management</h2>
        <p>Invite tutors, assign classes, and control account access.</p>
      </div>

      <div className="admin-grid">
        <InviteTutorForm />
        <TutorList />
      </div>
    </section>
  );
}
