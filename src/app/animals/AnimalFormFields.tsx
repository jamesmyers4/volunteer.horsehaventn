type AnimalDefaults = {
  name?: string
  intakeDate?: Date | null
  status?: string
  sex?: string
  spayed?: boolean
  legalCase?: boolean
  caseReference?: string | null
  requiredHandlerColor?: string
  handlingNotes?: string | null
  notes?: string | null
  herdOrder?: number | null
}

export function AnimalFormFields({ defaults }: { defaults?: AnimalDefaults }) {
  const intakeDateValue = defaults?.intakeDate ? defaults.intakeDate.toISOString().slice(0, 10) : ""

  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input type="text" name="name" defaultValue={defaults?.name} required className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Intake date
        <input type="date" name="intakeDate" defaultValue={intakeDateValue} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Status
        <select name="status" defaultValue={defaults?.status ?? "ACTIVE"} className="rounded border px-2 py-1">
          <option value="ACTIVE">Active</option>
          <option value="FOSTER">Foster</option>
          <option value="PENDING_ADOPTION">Pending Adoption</option>
          {/* Kept as a selectable option so an already-ADOPTED animal's edit page still
              renders its real status correctly — the server rejects any attempt to
              transition *into* ADOPTED from here; use "Record placement" instead. */}
          <option value="ADOPTED">Adopted</option>
          <option value="RETURNED">Returned</option>
          <option value="DECEASED">Deceased</option>
          <option value="TRANSFERRED">Transferred</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Sex
        <select name="sex" defaultValue={defaults?.sex ?? "UNKNOWN"} className="rounded border px-2 py-1">
          <option value="UNKNOWN">Unknown</option>
          <option value="STALLION">Stallion</option>
          <option value="GELDING">Gelding</option>
          <option value="MARE">Mare</option>
          <option value="COLT">Colt</option>
          <option value="FILLY">Filly</option>
          <option value="RIDGLING">Ridgling</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="spayed" defaultChecked={defaults?.spayed} />
        Spayed
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="legalCase" defaultChecked={defaults?.legalCase} />
        Active legal case
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Case reference
        <input type="text" name="caseReference" defaultValue={defaults?.caseReference ?? ""} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Required handler color
        <select name="requiredHandlerColor" defaultValue={defaults?.requiredHandlerColor ?? "GREEN"} className="rounded border px-2 py-1">
          <option value="GREEN">Green</option>
          <option value="ORANGE">Orange</option>
          <option value="YELLOW">Yellow</option>
          <option value="BLUE">Blue</option>
          <option value="RED">Red</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Handling notes
        <textarea name="handlingNotes" defaultValue={defaults?.handlingNotes ?? ""} rows={2} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Notes
        <textarea name="notes" defaultValue={defaults?.notes ?? ""} rows={3} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Herd order (Turnout Board rank, lower = higher in hierarchy)
        <input
          type="number"
          name="herdOrder"
          defaultValue={defaults?.herdOrder ?? ""}
          placeholder="leave blank if unranked"
          className="rounded border px-2 py-1"
        />
      </label>
    </>
  )
}
