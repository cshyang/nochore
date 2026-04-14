import { COLORS, RADIUS, TYPE } from "~/lib/colors";

export const timelineContainerStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 6,
};

export const markdownStyles = `
  .run-report-md {
    color: ${COLORS.text};
    font-family: ${TYPE.body};
    font-size: ${TYPE.scale.base};
    line-height: ${TYPE.leading.normal};
    word-break: break-word;
  }
  .run-report-md h1 {
    font-family: ${TYPE.display};
    font-size: ${TYPE.scale.lg};
    font-weight: ${TYPE.weight.bold};
    margin: 0 0 12px;
    color: ${COLORS.text};
    line-height: ${TYPE.leading.tight};
  }
  .run-report-md h2 {
    font-family: ${TYPE.display};
    font-size: ${TYPE.scale.md};
    font-weight: ${TYPE.weight.semibold};
    margin: 24px 0 8px;
    color: ${COLORS.text};
    line-height: ${TYPE.leading.snug};
  }
  .run-report-md h3 {
    font-family: ${TYPE.display};
    font-size: ${TYPE.scale.base};
    font-weight: ${TYPE.weight.semibold};
    margin: 20px 0 6px;
    color: ${COLORS.text};
  }
  .run-report-md h4 {
    font-size: ${TYPE.scale.sm};
    font-weight: ${TYPE.weight.semibold};
    margin: 16px 0 4px;
    color: ${COLORS.textSecondary};
    text-transform: uppercase;
    letter-spacing: ${TYPE.tracking.wide};
  }
  .run-report-md p {
    margin: 0 0 12px;
    color: ${COLORS.textSecondary};
  }
  .run-report-md ul, .run-report-md ol {
    margin: 0 0 12px;
    padding-left: 20px;
    color: ${COLORS.textSecondary};
  }
  .run-report-md li {
    margin-bottom: 4px;
  }
  .run-report-md strong {
    color: ${COLORS.text};
    font-weight: ${TYPE.weight.semibold};
  }
  .run-report-md a {
    color: ${COLORS.accent};
    text-decoration: none;
  }
  .run-report-md a:hover {
    text-decoration: underline;
  }
  .run-report-md code {
    font-family: ${TYPE.mono};
    font-size: 0.9em;
    background: ${COLORS.bgRaised};
    padding: 2px 6px;
    border-radius: ${RADIUS.sm}px;
    color: ${COLORS.text};
  }
  .run-report-md pre {
    background: ${COLORS.bgRaised};
    border: 1px solid ${COLORS.border};
    border-radius: ${RADIUS.sm}px;
    padding: 14px 16px;
    overflow-x: auto;
    margin: 0 0 12px;
  }
  .run-report-md pre code {
    background: none;
    padding: 0;
    font-size: ${TYPE.scale.sm};
  }
  .run-report-md table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 12px;
    font-size: ${TYPE.scale.sm};
  }
  .run-report-md th {
    text-align: left;
    padding: 8px 12px;
    border-bottom: 1px solid ${COLORS.borderStrong};
    color: ${COLORS.text};
    font-weight: ${TYPE.weight.semibold};
    font-size: ${TYPE.scale.xs};
    text-transform: uppercase;
    letter-spacing: ${TYPE.tracking.wide};
  }
  .run-report-md td {
    padding: 8px 12px;
    border-bottom: 1px solid ${COLORS.border};
    color: ${COLORS.textSecondary};
  }
  .run-report-md blockquote {
    border-left: 3px solid ${COLORS.accent};
    margin: 0 0 12px;
    padding: 8px 16px;
    color: ${COLORS.textSecondary};
    background: ${COLORS.accentSubtle};
    border-radius: 0 ${RADIUS.sm}px ${RADIUS.sm}px 0;
  }
  .run-report-md hr {
    border: none;
    border-top: 1px solid ${COLORS.border};
    margin: 20px 0;
  }
`;
