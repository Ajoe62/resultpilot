import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { db } from "../../lib/firebase";

const INITIAL_SCHOOL_FORM = {
  name: "",
  address: "",
};

const INITIAL_CLASS_FORM = {
  schoolId: "",
  name: "",
};

const INITIAL_STUDENT_FORM = {
  schoolId: "",
  classId: "",
  fullName: "",
  admissionNumber: "",
};

function getSchoolName(schools, schoolId) {
  return schools.find((school) => school.id === schoolId)?.name || "Unknown school";
}

function getClassName(classes, classId) {
  return classes.find((classItem) => classItem.id === classId)?.name || "Unknown class";
}

export default function ManageSetupPage() {
  const [schools, setSchools] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [schoolForm, setSchoolForm] = useState(INITIAL_SCHOOL_FORM);
  const [classForm, setClassForm] = useState(INITIAL_CLASS_FORM);
  const [studentForm, setStudentForm] = useState(INITIAL_STUDENT_FORM);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribeSchools = onSnapshot(
      query(collection(db, "schools"), orderBy("name", "asc")),
      (snapshot) => {
        setSchools(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      },
      (snapshotError) => setError(snapshotError.message),
    );

    const unsubscribeClasses = onSnapshot(
      query(collection(db, "classes"), orderBy("name", "asc")),
      (snapshot) => {
        setClasses(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      },
      (snapshotError) => setError(snapshotError.message),
    );

    const unsubscribeStudents = onSnapshot(
      query(collection(db, "students"), orderBy("fullName", "asc")),
      (snapshot) => {
        setStudents(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      },
      (snapshotError) => setError(snapshotError.message),
    );

    return () => {
      unsubscribeSchools();
      unsubscribeClasses();
      unsubscribeStudents();
    };
  }, []);

  useEffect(() => {
    setClassForm((current) => ({
      ...current,
      schoolId: current.schoolId || schools[0]?.id || "",
    }));
    setStudentForm((current) => ({
      ...current,
      schoolId: current.schoolId || schools[0]?.id || "",
    }));
  }, [schools]);

  const classOptions = useMemo(
    () => classes.filter((classItem) => classItem.schoolId === studentForm.schoolId && classItem.isActive !== false),
    [classes, studentForm.schoolId],
  );

  useEffect(() => {
    setStudentForm((current) => {
      const validClass = classOptions.some((classItem) => classItem.id === current.classId);

      return {
        ...current,
        classId: validClass ? current.classId : classOptions[0]?.id || "",
      };
    });
  }, [classOptions]);

  const createSchool = async (event) => {
    event.preventDefault();
    setError("");

    const name = schoolForm.name.trim();
    if (!name) {
      setError("School name is required.");
      return;
    }

    await addDoc(collection(db, "schools"), {
      name,
      address: schoolForm.address.trim(),
      isActive: true,
      createdAt: serverTimestamp(),
    });
    setSchoolForm(INITIAL_SCHOOL_FORM);
  };

  const createClass = async (event) => {
    event.preventDefault();
    setError("");

    const name = classForm.name.trim();
    if (!classForm.schoolId || !name) {
      setError("Select a school and enter a class name.");
      return;
    }

    await addDoc(collection(db, "classes"), {
      schoolId: classForm.schoolId,
      name,
      isActive: true,
      createdAt: serverTimestamp(),
    });
    setClassForm((current) => ({ ...current, name: "" }));
  };

  const createStudent = async (event) => {
    event.preventDefault();
    setError("");

    const fullName = studentForm.fullName.trim();
    const admissionNumber = studentForm.admissionNumber.trim();
    const selectedSchool = schools.find((school) => school.id === studentForm.schoolId);
    const selectedClass = classes.find((classItem) => classItem.id === studentForm.classId);

    if (!selectedSchool || !selectedClass || !fullName) {
      setError("Select a school, select a class, and enter the student name.");
      return;
    }

    await addDoc(collection(db, "students"), {
      schoolId: selectedSchool.id,
      schoolName: selectedSchool.name,
      classId: selectedClass.id,
      className: selectedClass.name,
      fullName,
      admissionNumber,
      isActive: true,
      createdAt: serverTimestamp(),
    });
    setStudentForm((current) => ({
      ...current,
      fullName: "",
      admissionNumber: "",
    }));
  };

  const toggleActive = async (collectionName, item) => {
    await updateDoc(doc(db, collectionName, item.id), {
      isActive: item.isActive === false,
    });
  };

  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>School Setup</h2>
        <p>Create the school, class, and student records used for exports and result sheets.</p>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="setup-grid">
        <form className="card form-card" onSubmit={createSchool}>
          <div className="section-heading">
            <h3>Schools</h3>
            <p>{schools.length} records</p>
          </div>
          <label className="field">
            <span>School Name</span>
            <input
              value={schoolForm.name}
              onChange={(event) =>
                setSchoolForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Bright Future Academy"
            />
          </label>
          <label className="field">
            <span>Address</span>
            <input
              value={schoolForm.address}
              onChange={(event) =>
                setSchoolForm((current) => ({ ...current, address: event.target.value }))
              }
              placeholder="School address"
            />
          </label>
          <button className="primary-button" type="submit">Add School</button>
        </form>

        <form className="card form-card" onSubmit={createClass}>
          <div className="section-heading">
            <h3>Classes</h3>
            <p>{classes.length} records</p>
          </div>
          <label className="field">
            <span>School</span>
            <select
              value={classForm.schoolId}
              onChange={(event) =>
                setClassForm((current) => ({ ...current, schoolId: event.target.value }))
              }
            >
              <option value="">Select school</option>
              {schools.filter((school) => school.isActive !== false).map((school) => (
                <option key={school.id} value={school.id}>{school.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Class Name</span>
            <input
              value={classForm.name}
              onChange={(event) =>
                setClassForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="JSS1 A"
            />
          </label>
          <button className="primary-button" type="submit">Add Class</button>
        </form>

        <form className="card form-card" onSubmit={createStudent}>
          <div className="section-heading">
            <h3>Students</h3>
            <p>{students.length} records</p>
          </div>
          <label className="field">
            <span>School</span>
            <select
              value={studentForm.schoolId}
              onChange={(event) =>
                setStudentForm((current) => ({
                  ...current,
                  schoolId: event.target.value,
                  classId: "",
                }))
              }
            >
              <option value="">Select school</option>
              {schools.filter((school) => school.isActive !== false).map((school) => (
                <option key={school.id} value={school.id}>{school.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Class</span>
            <select
              value={studentForm.classId}
              onChange={(event) =>
                setStudentForm((current) => ({ ...current, classId: event.target.value }))
              }
            >
              <option value="">Select class</option>
              {classOptions.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Full Name</span>
            <input
              value={studentForm.fullName}
              onChange={(event) =>
                setStudentForm((current) => ({ ...current, fullName: event.target.value }))
              }
              placeholder="Amina Yusuf"
            />
          </label>
          <label className="field">
            <span>Admission Number</span>
            <input
              value={studentForm.admissionNumber}
              onChange={(event) =>
                setStudentForm((current) => ({ ...current, admissionNumber: event.target.value }))
              }
              placeholder="ADM-001"
            />
          </label>
          <button className="primary-button" type="submit">Add Student</button>
        </form>
      </div>

      <div className="card table-card">
        <div className="section-heading">
          <h3>Registered Students</h3>
          <p>These records drive the student selection flow.</p>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Admission No.</th>
                <th>School</th>
                <th>Class</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id}>
                  <td>{student.fullName}</td>
                  <td>{student.admissionNumber || "-"}</td>
                  <td>{student.schoolName || getSchoolName(schools, student.schoolId)}</td>
                  <td>{student.className || getClassName(classes, student.classId)}</td>
                  <td>{student.isActive === false ? "Inactive" : "Active"}</td>
                  <td>
                    <button
                      className="secondary-button"
                      onClick={() => toggleActive("students", student)}
                      type="button"
                    >
                      {student.isActive === false ? "Activate" : "Deactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!students.length ? <p className="muted-text">No students registered yet.</p> : null}
        </div>
      </div>

      <div className="card list-card">
        <div className="section-heading">
          <h3>Schools and Classes</h3>
          <p>Deactivate records when they should no longer appear to students.</p>
        </div>
        <div className="stack-list">
          {schools.map((school) => (
            <article className="stack-list__item" key={school.id}>
              <div>
                <strong>{school.name}</strong>
                <p>{school.address || "No address"}</p>
                <small>
                  {classes.filter((classItem) => classItem.schoolId === school.id).length} classes
                </small>
              </div>
              <button
                className="secondary-button"
                onClick={() => toggleActive("schools", school)}
                type="button"
              >
                {school.isActive === false ? "Activate" : "Deactivate"}
              </button>
            </article>
          ))}
          {!schools.length ? <p className="muted-text">No schools created yet.</p> : null}
        </div>
      </div>
    </section>
  );
}
