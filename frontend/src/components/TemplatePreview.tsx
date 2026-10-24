import { Calendar, MapPin, Video, Globe } from "lucide-react";

interface TemplatePreviewProps {
  template: string;
  eventName: string;
  description: string;
  startDate: string;
  startTime: string;
  locationType: "virtual" | "physical" | "hybrid";
  locationValue: string;
  locationAddress: string;
  flyerUrl: string | null;
  colorMode?: "light" | "dark";
}

const FormFieldsMock = () => (
  <div className="space-y-1.5">
    <div className="h-1.5 w-10 rounded bg-muted-foreground/20 text-[6px]" />
    <div className="h-4 rounded border border-border bg-background" />
    <div className="h-1.5 w-12 rounded bg-muted-foreground/20" />
    <div className="h-4 rounded border border-border bg-background" />
    <div className="h-1.5 w-8 rounded bg-muted-foreground/20" />
    <div className="h-4 rounded border border-border bg-background" />
    <div className="h-5 rounded bg-primary mt-2" />
  </div>
);

const EventInfo = ({ eventName, description, startDate, startTime, locationType }: Partial<TemplatePreviewProps>) => (
  <div className="space-y-1">
    <p className="font-bold text-[8px] leading-tight truncate">{eventName || "Event Name"}</p>
    {startDate && (
      <div className="flex items-center gap-0.5 text-muted-foreground">
        <Calendar className="w-2 h-2" />
        <span className="text-[5px]">{startDate} {startTime}</span>
      </div>
    )}
    {locationType && (
      <div className="flex items-center gap-0.5 text-muted-foreground">
        {locationType === "virtual" ? <Video className="w-2 h-2" /> : locationType === "physical" ? <MapPin className="w-2 h-2" /> : <Globe className="w-2 h-2" />}
        <span className="text-[5px] capitalize">{locationType}</span>
      </div>
    )}
    {description && <p className="text-[5px] text-muted-foreground line-clamp-2">{description}</p>}
  </div>
);

const ImagePlaceholder = ({ flyerUrl, className = "" }: { flyerUrl: string | null; className?: string }) => (
  <div className={`flex items-center justify-center overflow-hidden ${className}`}>
    {flyerUrl ? (
      <img src={flyerUrl} alt="Flyer" className="w-full h-full object-cover" />
    ) : (
      <div className="text-[6px] text-muted-foreground">No Image</div>
    )}
  </div>
);

const TemplatePreview = (props: TemplatePreviewProps) => {
  const { template, flyerUrl, colorMode = "light" } = props;

  return (
    <div className={colorMode === "dark" ? "dark" : ""}>
    <div className="border border-border rounded-lg overflow-hidden bg-background text-foreground" style={{ width: 360, height: 240 }}>
      {template === "minimal" && (
        <div className="flex items-center justify-center h-full p-4">
          <div className="w-full max-w-[160px] space-y-2">
            <EventInfo {...props} />
            <FormFieldsMock />
          </div>
        </div>
      )}

      {template === "split" && (
        <div className="flex h-full">
          <ImagePlaceholder flyerUrl={flyerUrl} className="w-1/2 h-full" />
          <div className="w-1/2 p-2 flex flex-col justify-center space-y-2">
            <EventInfo {...props} />
            <FormFieldsMock />
          </div>
        </div>
      )}

      {template === "stacked" && (
        <div className="flex flex-col h-full">
          <ImagePlaceholder flyerUrl={flyerUrl} className="h-[60px] w-full" />
          <div className="flex-1 p-2 space-y-1 overflow-hidden">
            <EventInfo {...props} />
            <FormFieldsMock />
          </div>
        </div>
      )}

      {template === "landing" && (
        <div className="flex flex-col h-full">
          <div className="relative h-[70px] w-full">
            <ImagePlaceholder flyerUrl={flyerUrl} className="absolute inset-0" />
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <p className="text-[8px] font-bold text-white truncate px-2">{props.eventName || "Event Name"}</p>
            </div>
          </div>
          <div className="flex-1 p-2 space-y-1 overflow-hidden">
            <FormFieldsMock />
          </div>
        </div>
      )}

      {template === "cards" && (
        <div className="p-2 h-full flex flex-col">
          <EventInfo {...props} />
          <div className="grid grid-cols-2 gap-1 mt-1 flex-1">
            {["Session 1", "Session 2", "Session 3", "Session 4"].map(s => (
              <div key={s} className="border border-border rounded p-1 flex items-center justify-center">
                <span className="text-[5px] text-muted-foreground">{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    </div>
  );
};

export default TemplatePreview;
