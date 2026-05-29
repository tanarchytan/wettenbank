import { ArticleActions } from "./ArticleActions";

interface Article {
  number: string;
  anchorId: string;
  heading: string | null;
  bodyText: string;
}

interface Props {
  article: Article;
  bwbId: string;
  eliUri: string;
  validFrom: string;
}

export function ArticleBody({ article, bwbId, eliUri, validFrom }: Props) {
  return (
    <div className="artikel" id={article.anchorId} data-anchor={article.anchorId}>
      <div className="kop group flex items-baseline gap-2">
        <span>
          Artikel {article.number}
          {article.heading ? ` — ${article.heading}` : ""}
        </span>
        {/* Hover anchor */}
        <a
          href={`#${article.anchorId}`}
          className="artikel-anchor text-rijks-link/40 no-underline text-sm font-normal
            opacity-0 group-hover:opacity-100 transition-opacity hover:text-rijks-link"
          aria-label={`Directe link naar artikel ${article.number}`}
        >
          #
        </a>
        <span className="flex-1" />
        <ArticleActions bwbId={bwbId} eliUri={eliUri} validFrom={validFrom} article={article} />
      </div>
      <div className="al whitespace-pre-line prose-legal">{article.bodyText.trim()}</div>
    </div>
  );
}
