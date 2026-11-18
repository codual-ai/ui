import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";

export function Code({ code, lang }: { code: string; lang: string }) {
  return <ServerCodeBlock code={code} lang={lang} />;
}
