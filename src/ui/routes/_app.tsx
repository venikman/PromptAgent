import { Head } from "@fresh/core/runtime";
import type { PageProps } from "@fresh/core/render";

export default function App({ Component }: PageProps) {
  return (
    <>
      <Head>
        <title>PromptAgent Studio</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/styles.css" />
      </Head>
      <Component />
    </>
  );
}
