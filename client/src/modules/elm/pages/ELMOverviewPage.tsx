import { useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FaCalendarAlt, FaPlus, FaUmbrellaBeach } from "react-icons/fa";

import { errorMessage, http } from "../../../lib/http";
import { PageHeader } from "../../../ui/components/PageHeader";

type LeaveCategory = "CL" | "RH" | "SCL" | "EL" | "COL" | "VL";
type LeaveApplication = {
  id: number;
  category: LeaveCategory;
  start_date: string;
  end_date: string;
  requested_days: string;
  purpose: string;
  status: string;
  half_day_portion: string;
  created_at: string;
};
type LeaveBalance = {
  category: LeaveCategory;
  annual_entitlement: string;
  current_balance: string;
};
type ApplicationList = { results: LeaveApplication[] };
type BalanceList = { leave_year: number; results: LeaveBalance[] };

const CATEGORIES: { value: LeaveCategory; label: string }[] = [
  { value: "CL", label: "Casual leave" },
  { value: "RH", label: "Restricted holiday" },
  { value: "SCL", label: "Special casual leave" },
  { value: "EL", label: "Earned leave" },
  { value: "COL", label: "Commuted leave" },
  { value: "VL", label: "Vacation leave" },
];

const CATEGORY_NAMES = Object.fromEntries(
  CATEGORIES.map(({ value, label }) => [value, label]),
) as Record<LeaveCategory, string>;

const STATUS_COLORS: Record<string, string> = {
  awaiting_substitute_response: "yellow",
  applicant_action_required: "orange",
  awaiting_unit_head_review: "blue",
  awaiting_establishment_routing: "indigo",
  awaiting_final_sanction_decision: "violet",
  awaiting_director_self_sanction: "violet",
  approved: "green",
  rejected: "red",
  withdrawn: "gray",
  cancelled: "gray",
};

const WITHDRAWABLE = new Set([
  "awaiting_substitute_response",
  "applicant_action_required",
  "awaiting_unit_head_review",
  "awaiting_establishment_routing",
  "awaiting_final_sanction_decision",
  "awaiting_director_self_sanction",
]);

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function previewDays(
  category: LeaveCategory,
  startDate: string,
  endDate: string,
  halfDayPortion: string,
) {
  if (!startDate || !endDate || endDate < startDate) return "—";
  if (halfDayPortion) return category === "CL" && startDate === endDate ? "0.5" : "—";
  if (["CL", "RH", "SCL"].includes(category)) {
    return startDate === endDate ? "1" : "—";
  }
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return String(Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

export default function ELMOverviewPage() {
  const queryClient = useQueryClient();
  const [formOpened, setFormOpened] = useState(false);
  const [category, setCategory] = useState<LeaveCategory>("CL");
  const [startDate, setStartDate] = useState(localDateString(new Date()));
  const [endDate, setEndDate] = useState(localDateString(new Date()));
  const [purpose, setPurpose] = useState("");
  const [halfDayPortion, setHalfDayPortion] = useState("");

  const applications = useQuery({
    queryKey: ["elm", "applications"],
    queryFn: async () => (await http.get<ApplicationList>("/elm/applications")).data,
  });
  const balances = useQuery({
    queryKey: ["elm", "balances"],
    queryFn: async () => (await http.get<BalanceList>("/elm/balances")).data,
  });

  const submit = useMutation({
    mutationFn: async () => (await http.post<LeaveApplication>("/elm/applications", {
      category,
      start_date: startDate,
      end_date: endDate,
      purpose,
      half_day_portion: halfDayPortion,
    })).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["elm"] });
      setFormOpened(false);
      setPurpose("");
      setHalfDayPortion("");
      notifications.show({
        color: "green",
        title: "Request submitted",
        message: "Your leave request is now in the approval workflow.",
      });
    },
    onError: (error) => notifications.show({
      color: "red",
      title: "Could not submit request",
      message: errorMessage(error),
    }),
  });

  const withdraw = useMutation({
    mutationFn: async (applicationId: number) =>
      http.post(`/elm/applications/${applicationId}/actions`, { action: "withdraw" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["elm", "applications"] });
      notifications.show({
        color: "gray",
        title: "Request withdrawn",
        message: "Your leave request has been withdrawn.",
      });
    },
    onError: (error) => notifications.show({
      color: "red",
      title: "Could not withdraw request",
      message: errorMessage(error),
    }),
  });

  const balanceByCategory = useMemo(
    () => new Map((balances.data?.results ?? []).map((row) => [row.category, row])),
    [balances.data],
  );
  const rows = applications.data?.results ?? [];
  const pendingCount = rows.filter((row) => WITHDRAWABLE.has(row.status)).length;
  const daysPreview = previewDays(category, startDate, endDate, halfDayPortion);
  const formIsValid = daysPreview !== "—" && purpose.trim().length > 0;

  function openForm() {
    setStartDate(localDateString(new Date()));
    setEndDate(localDateString(new Date()));
    setFormOpened(true);
  }

  return (
    <Container size="xl" py="md">
      <PageHeader
        title="Leave Management"
        subtitle="Check your leave balance, submit a request, and follow its progress."
        action={(
          <Button leftSection={<FaPlus size={13} />} onClick={openForm}>
            Apply for leave
          </Button>
        )}
      />

      <Group justify="space-between" mb="sm">
        <Title order={4}>Your leave balance</Title>
        <Text size="sm" c="dimmed">Leave year {balances.data?.leave_year ?? new Date().getFullYear()}</Text>
      </Group>

      {balances.error ? (
        <Alert color="red" mb="md" title="Balances are unavailable">
          {errorMessage(balances.error)}
        </Alert>
      ) : null}

      {balances.data?.results.length === 0 && !balances.isPending ? (
        <Alert color="blue" mb="md" title="No leave accounts found">
          Your leave entitlements have not been added for this leave year yet. You can still view and submit a request.
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="md" mb="xl">
        {CATEGORIES.map(({ value, label }) => {
          const balance = balanceByCategory.get(value);
          return (
            <Card key={value} withBorder radius="md" padding="md">
              <Group justify="space-between" align="flex-start">
                <Stack gap={2}>
                  <Text size="sm" c="dimmed">{label}</Text>
                  <Text fw={700} size="xl">
                    {balance ? balance.current_balance : "—"}
                    <Text span size="sm" fw={400} c="dimmed"> days</Text>
                  </Text>
                </Stack>
                <Badge variant="light" color="teal">{value}</Badge>
              </Group>
              <Text size="xs" c="dimmed" mt="sm">
                {balance ? `${balance.annual_entitlement} days entitlement` : "Entitlement not configured"}
              </Text>
            </Card>
          );
        })}
      </SimpleGrid>

      <Group justify="space-between" mb="sm">
        <div>
          <Title order={4}>My requests</Title>
          <Text size="sm" c="dimmed" mt={3}>
            {pendingCount ? `${pendingCount} request${pendingCount === 1 ? "" : "s"} awaiting action` : "Your submitted leave requests"}
          </Text>
        </div>
        <Badge leftSection={<FaCalendarAlt size={10} />} variant="light" color="blue">
          {rows.length} total
        </Badge>
      </Group>

      {applications.error ? (
        <Alert color="red" mb="md" title="Requests are unavailable">
          {errorMessage(applications.error)}
        </Alert>
      ) : null}

      <Card withBorder radius="md" padding={0}>
        <ScrollArea>
          <Table miw={760} verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Leave type</Table.Th>
                <Table.Th>Dates</Table.Th>
                <Table.Th>Days</Table.Th>
                <Table.Th>Submitted</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((application) => (
                <Table.Tr key={application.id}>
                  <Table.Td>
                    <Stack gap={0}>
                      <Text size="sm" fw={600}>{CATEGORY_NAMES[application.category]}</Text>
                      <Text size="xs" c="dimmed">{application.category}</Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>{application.start_date === application.end_date
                    ? application.start_date
                    : `${application.start_date} – ${application.end_date}`}</Table.Td>
                  <Table.Td>{application.requested_days}</Table.Td>
                  <Table.Td>{new Date(application.created_at).toLocaleDateString()}</Table.Td>
                  <Table.Td>
                    <Badge color={STATUS_COLORS[application.status] ?? "gray"} variant="light">
                      {application.status.replace(/_/g, " ")}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {WITHDRAWABLE.has(application.status) && (
                      <Button
                        size="xs"
                        variant="subtle"
                        color="gray"
                        loading={withdraw.isPending}
                        onClick={() => withdraw.mutate(application.id)}
                      >
                        Withdraw
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
              {!rows.length && !applications.isPending && (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Stack align="center" gap="xs" py="xl">
                      <FaUmbrellaBeach size={25} color="var(--mantine-color-teal-6)" />
                      <Text fw={600}>No leave requests yet</Text>
                      <Text size="sm" c="dimmed">When you apply, your requests and their status appear here.</Text>
                      <Button variant="light" mt="xs" onClick={openForm}>Start a request</Button>
                    </Stack>
                  </Table.Td>
                </Table.Tr>
              )}
              {applications.isPending && (
                <Table.Tr><Table.Td colSpan={6}><Text c="dimmed" ta="center" py="lg">Loading your requests…</Text></Table.Td></Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Card>

      <Modal
        opened={formOpened}
        onClose={() => setFormOpened(false)}
        title="Apply for leave"
        centered
        size="lg"
      >
        <Stack>
          <Select
            label="Leave type"
            data={CATEGORIES.map(({ value, label }) => ({ value, label: `${label} (${value})` }))}
            value={category}
            onChange={(value) => {
              if (value) setCategory(value as LeaveCategory);
              if (value !== "CL") setHalfDayPortion("");
            }}
            allowDeselect={false}
            required
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              type="date" label="From" value={startDate}
              onChange={(event) => setStartDate(event.currentTarget.value)} required
            />
            <TextInput
              type="date" label="To" value={endDate}
              onChange={(event) => setEndDate(event.currentTarget.value)} required
            />
          </SimpleGrid>
          {category === "CL" && startDate === endDate && (
            <Select
              label="Day portion"
              data={[
                { value: "", label: "Full day" },
                { value: "first_half", label: "First half" },
                { value: "second_half", label: "Second half" },
              ]}
              value={halfDayPortion}
              onChange={(value) => setHalfDayPortion(value ?? "")}
              allowDeselect={false}
            />
          )}
          <Textarea
            label="Reason for leave"
            placeholder="Briefly explain your request"
            minRows={3}
            maxLength={5000}
            value={purpose}
            onChange={(event) => setPurpose(event.currentTarget.value)}
            required
          />
          <Group justify="space-between">
            <Text size="sm" c={daysPreview === "—" ? "red" : "dimmed"}>
              Requested days: {daysPreview}
            </Text>
            <Group>
              <Button variant="default" onClick={() => setFormOpened(false)}>Cancel</Button>
              <Button
                onClick={() => submit.mutate()}
                loading={submit.isPending}
                disabled={!formIsValid}
              >
                Submit request
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
