import "./BaseBackground.sass";

import { Icon } from "@iconify/react";
import { type FC, Fragment, memo, type ReactNode } from "react";
import { CrossFade } from "react-crossfade-simple";

import { usePublishBackgroundAppearance } from "../../../backgroundAppearance";
import { useBackdropPresentation } from "./useBackdrop";

interface CreditLink {
  label: ReactNode;
  url?: string;
}

interface Props {
  containerClassName?: string;
  url: string | null;
  paused?: boolean;
  onPause?: () => void;
  onPrev?: (() => void) | null;
  onNext?: (() => void) | null;
  showControls?: boolean;
  controlsOnHover?: boolean;
  showInfo?: boolean;
  leftInfo?: CreditLink[];
  rightInfo?: CreditLink | null;
  children?: ReactNode;
  estimatedLuminance?: number;
}

const BaseBackground: FC<Props> = ({
  containerClassName = "Unsplash fullscreen",
  url,
  paused = false,
  onPause = () => {},
  onPrev = null,
  onNext = null,
  showControls = true,
  controlsOnHover = false,
  showInfo = true,
  leftInfo = [],
  rightInfo = null,
  children,
  estimatedLuminance = 0.5,
}) => {
  const { backdropStyle, baseColor, effectiveLuminance, owner } =
    useBackdropPresentation(estimatedLuminance);
  usePublishBackgroundAppearance(owner, effectiveLuminance);

  return (
    <div className={`${containerClassName} bg-base`}>
      <div className="fullscreen" style={{ backgroundColor: baseColor }}>
        <CrossFade contentKey={url || ""} timeout={2500}>
          <div
            className="image fullscreen"
            style={{
              ...backdropStyle,
              backgroundImage: url ? `url(${url})` : undefined,
            }}
          >
            {children}
          </div>
        </CrossFade>
      </div>

      <div className="info-bar">
        <div className="left-info">
          {showInfo &&
            leftInfo.map((info, index) => (
              <Fragment key={index}>
                {index > 0 && ", "}
                {info.url ? (
                  <a href={info.url} rel="noopener noreferrer">
                    {info.label}
                  </a>
                ) : (
                  <span>{info.label}</span>
                )}
              </Fragment>
            ))}
        </div>

        {showControls && (
          <div className={`controls ${controlsOnHover ? "is-on-hover" : ""}`}>
            <a className={onPrev ? "" : "hidden"} onClick={onPrev ?? undefined}>
              <Icon icon="feather:arrow-left" />
            </a>{" "}
            <a onClick={onPause}>
              <Icon icon={paused ? "feather:play" : "feather:pause"} />
            </a>{" "}
            <a className={onNext ? "" : "hidden"} onClick={onNext ?? undefined}>
              <Icon icon="feather:arrow-right" />
            </a>
          </div>
        )}

        <div className="right-info">
          {showInfo && rightInfo && (
            <>
              {rightInfo.url ? (
                <a href={rightInfo.url} rel="noopener noreferrer">
                  {rightInfo.label}
                </a>
              ) : (
                <span>{rightInfo.label}</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(BaseBackground);
