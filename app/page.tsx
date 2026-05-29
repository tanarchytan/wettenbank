import { redirect } from "next/navigation";

export default function HomePage(): never {
  // Wetten.nl mirrors this — root URL is the eenvoudig-zoeken page.
  redirect("/zoeken");
}
