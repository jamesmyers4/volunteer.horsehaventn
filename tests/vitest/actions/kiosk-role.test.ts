import { describe, it, expect, beforeEach } from "vitest"
import { updateVolunteerRole, updateCanScheduleEvents } from "@/app/admin/volunteers/actions"
import { createRecurringTaskTemplate, updateRecurringTaskTemplate } from "@/app/facility-tasks/actions"
import { createCredentialType, updateCredentialType } from "@/app/volunteers/training-actions"
import { assignShiftLead } from "@/app/checkin/roster/actions"
import { setShiftActualTimes } from "@/app/checkin/actions"
import { releaseBlue } from "@/app/volunteers/tier-actions"
import { updateTierThreshold } from "@/app/tiers/actions"
import { createVolunteerTag, updateVolunteerTag, assignTag, removeTag } from "@/app/volunteers/tag-actions"
import { createIntakeGroup, updateIntakeGroup } from "@/app/intake-groups/actions"
import { createEventCategory, updateEventCategory } from "@/app/admin/event-categories/actions"
import { createCareEntry, createHealthIssue, resolveHealthIssue } from "@/app/animals/[id]/care-actions"
import {
  createChecklistTemplate,
  updateChecklistTemplate,
  createChecklistTemplateItem,
  updateChecklistTemplateItem
} from "@/app/checklists/actions"
import { createFeedingBaseline, createFeedingOverride } from "@/app/animals/[id]/feeding-actions"
import { createLocationAssignment } from "@/app/animals/[id]/location-actions"
import { createAnimal, updateAnimal } from "@/app/animals/actions"
import { updateFarmSettings, updateShiftTemplate } from "@/app/settings/actions"
import { createLocation, updateLocation } from "@/app/locations/actions"
import { createMedicationRegimen, endMedicationRegimen, logMedicationAdministered } from "@/app/animals/[id]/medication-actions"
import { assignIntakeGroup } from "@/app/animals/[id]/intake-group-actions"
import { updateFacilityTaskType } from "@/app/admin/facility-task-types/actions"
import { createPlacement } from "@/app/animals/[id]/placement-actions"
import { createWeightEntry, createAnimalMetric } from "@/app/animals/[id]/metrics-actions"
import { createAnimalRelationship } from "@/app/animals/[id]/relationship-actions"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createVolunteer } from "../helpers/factories"
import { formData } from "../helpers/form"

// V4.md Session 1's audit requirement in one place: "A KIOSK-role account is rejected by every
// existing write-capable Server Action, not just newly-audited ones." Every action below is
// gated by requireRole([...]) — an allowlist that never names KIOSK, so it's rejected as soon
// as the enum value exists, with no per-action code change required. This file exists to prove
// that claim for real rather than leaving it as an assumption: it exercises every remaining
// write-capable action in the app not already covered by a dedicated KIOSK test elsewhere
// (postChatMessage, submitCheckIn, updateOwnCheckIn, logFacilityTaskCompletion, the photo
// upload route, signupForEvent/cancelSignup, logTrainingCompletion, submitShiftReport,
// submitRosterAttendance, createEvent/updateEvent/cancelEvent — those live alongside their own
// existing test suites since they needed an actual code change, see src/lib/auth.ts's
// requireNonKioskVolunteer).
//
// Every one of these functions checks the caller's role as its very first statement, before
// touching any other argument — confirmed by reading each file — so a garbage/nonexistent id
// or a near-empty FormData is safe to pass here: the rejection happens before any of it is
// ever used.
describe("KIOSK-role account rejected by every write-capable Server Action", () => {
  beforeEach(async () => {
    await createVolunteer({ clerkId: "clerk_kiosk_sweep", role: "KIOSK" })
    mockSignedInAs("clerk_kiosk_sweep")
  })

  const rejected = (label: string, run: () => Promise<unknown>) => {
    it(`${label} rejects KIOSK`, async () => {
      await expect(run()).rejects.toThrow("Not authorized")
    })
  }

  rejected("admin/volunteers/actions.ts updateVolunteerRole", () => updateVolunteerRole("x", formData({ role: "ADMIN" })))
  rejected("admin/volunteers/actions.ts updateCanScheduleEvents", () => updateCanScheduleEvents("x", formData({})))

  rejected("facility-tasks/actions.ts createRecurringTaskTemplate", () =>
    createRecurringTaskTemplate(formData({ taskTypeId: "x", targetLocationId: "x", dayOfWeek: "1", shiftType: "AM" }))
  )
  rejected("facility-tasks/actions.ts updateRecurringTaskTemplate", () =>
    updateRecurringTaskTemplate("x", formData({ taskTypeId: "x", targetLocationId: "x", dayOfWeek: "1", shiftType: "AM" }))
  )

  rejected("volunteers/training-actions.ts createCredentialType", () => createCredentialType(formData({ name: "x" })))
  rejected("volunteers/training-actions.ts updateCredentialType", () => updateCredentialType("x", formData({})))

  rejected("checkin/roster/actions.ts assignShiftLead", () => assignShiftLead("2026-07-20", "AM", formData({ assignedLeadId: "x" })))
  rejected("checkin/actions.ts setShiftActualTimes", () =>
    setShiftActualTimes("2026-07-20", "AM", formData({ actualStartTime: "09:00", actualEndTime: "11:00" }))
  )

  rejected("volunteers/tier-actions.ts releaseBlue", () => releaseBlue("x"))
  rejected("tiers/actions.ts updateTierThreshold", () => updateTierThreshold("x", formData({ minDaysTenure: "1" })))

  rejected("volunteers/tag-actions.ts createVolunteerTag", () => createVolunteerTag(formData({ name: "x" })))
  rejected("volunteers/tag-actions.ts updateVolunteerTag", () => updateVolunteerTag("x", formData({})))
  rejected("volunteers/tag-actions.ts assignTag", () => assignTag("x", formData({ tagId: "x" })))
  rejected("volunteers/tag-actions.ts removeTag", () => removeTag("x"))

  rejected("intake-groups/actions.ts createIntakeGroup", () => createIntakeGroup(formData({ label: "x", intakeDate: "2026-01-01" })))
  rejected("intake-groups/actions.ts updateIntakeGroup", () => updateIntakeGroup("x", formData({ label: "x", intakeDate: "2026-01-01" })))

  rejected("admin/event-categories/actions.ts createEventCategory", () => createEventCategory(formData({ name: "x" })))
  rejected("admin/event-categories/actions.ts updateEventCategory", () => updateEventCategory("x", formData({ name: "x" })))

  rejected("animals/[id]/care-actions.ts createCareEntry", () => createCareEntry("x", formData({ careTypeId: "x" })))
  rejected("animals/[id]/care-actions.ts createHealthIssue", () => createHealthIssue("x", formData({ description: "x" })))
  rejected("animals/[id]/care-actions.ts resolveHealthIssue", () => resolveHealthIssue("x", "x"))

  rejected("checklists/actions.ts createChecklistTemplate", () => createChecklistTemplate(formData({ name: "x" })))
  rejected("checklists/actions.ts updateChecklistTemplate", () => updateChecklistTemplate("x", formData({ name: "x" })))
  rejected("checklists/actions.ts createChecklistTemplateItem", () =>
    createChecklistTemplateItem("x", formData({ order: "0", prompt: "x", responseType: "TEXT" }))
  )
  rejected("checklists/actions.ts updateChecklistTemplateItem", () =>
    updateChecklistTemplateItem("x", formData({ order: "0", prompt: "x", responseType: "TEXT" }))
  )

  rejected("animals/[id]/feeding-actions.ts createFeedingBaseline", () =>
    createFeedingBaseline("x", formData({ feedTypeId: "x", shift: "AM", amount: "1" }))
  )
  rejected("animals/[id]/feeding-actions.ts createFeedingOverride", () => createFeedingOverride("x", "x", formData({ amount: "1" })))

  rejected("animals/[id]/location-actions.ts createLocationAssignment", () =>
    createLocationAssignment("x", formData({ locationId: "x", period: "DAY" }))
  )

  rejected("animals/actions.ts createAnimal", () => createAnimal(formData({ name: "x", status: "ACTIVE" })))
  rejected("animals/actions.ts updateAnimal", () => updateAnimal("x", formData({ name: "x", status: "ACTIVE" })))

  rejected("settings/actions.ts updateFarmSettings", () => updateFarmSettings(formData({ activeSeason: "STANDARD" })))
  rejected("settings/actions.ts updateShiftTemplate", () =>
    updateShiftTemplate("x", formData({ standardStartTime: "09:00", standardEndTime: "11:00" }))
  )

  rejected("locations/actions.ts createLocation", () => createLocation(formData({ type: "FIELD", name: "x" })))
  rejected("locations/actions.ts updateLocation", () => updateLocation("x", formData({ name: "x" })))

  rejected("animals/[id]/medication-actions.ts createMedicationRegimen", () =>
    createMedicationRegimen("x", formData({ drugName: "x", dose: "x", frequency: "x" }))
  )
  rejected("animals/[id]/medication-actions.ts endMedicationRegimen", () => endMedicationRegimen("x", "x"))
  rejected("animals/[id]/medication-actions.ts logMedicationAdministered", () =>
    logMedicationAdministered("x", "x", formData({ administered: "true" }))
  )

  rejected("animals/[id]/intake-group-actions.ts assignIntakeGroup", () => assignIntakeGroup("x", formData({ intakeGroupId: "x" })))

  rejected("admin/facility-task-types/actions.ts updateFacilityTaskType", () => updateFacilityTaskType("x", formData({ name: "x" })))

  rejected("animals/[id]/placement-actions.ts createPlacement", () =>
    createPlacement("x", formData({ adopterName: "x", placedDate: "2026-01-01" }))
  )

  rejected("animals/[id]/metrics-actions.ts createWeightEntry", () => createWeightEntry("x", formData({ weight: "1", context: "ROUTINE" })))
  rejected("animals/[id]/metrics-actions.ts createAnimalMetric", () => createAnimalMetric("x", formData({ metricTypeId: "x", value: "1" })))

  rejected("animals/[id]/relationship-actions.ts createAnimalRelationship", () =>
    createAnimalRelationship("x", formData({ relatedAnimalId: "y", relationType: "OTHER" }))
  )
})
