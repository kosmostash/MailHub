import Link from "~/components/Link";

export default function NotFoundPage() {
  return (
    <div class="p-6">
      <h1 class="text-xl font-semibold">Page not found</h1>
      <p class="mt-2 text-sm text-gray-600">
        <Link to={["index"]} class="text-blue-700 underline">
          Back to the dashboard
        </Link>
      </p>
    </div>
  );
}
