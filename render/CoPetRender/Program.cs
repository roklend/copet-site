using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.Text.Json;

const int TitleBarHeight = 28;
const int TitleBarPadding = 6;
const int CloseButtonSize = 18;
const int TitleBarButtonGap = 4;
const float TitleFontScale = 0.8f;
const int HudPadding = 6;
const int UiFps = 6;
const int FrameWidth = 256;
const int FrameHeight = 284;
const int SatelliteSize = 256;
const int X2Scale = 2;

var repoRoot = FindRepoRoot(Directory.GetCurrentDirectory());
var assetRoot = Path.Combine(repoRoot, "assets", "sat");
var fontPath = Path.Combine(repoRoot, "assets", "font", "LCDSolid1.13-Regular.otf");
var outputRoot = Path.Combine(repoRoot, "site", "render", "output");
var baseRoot = Path.Combine(outputRoot, "base");
var x2Root = Path.Combine(outputRoot, "x2");

Directory.CreateDirectory(baseRoot);
Directory.CreateDirectory(x2Root);
DeleteExistingFrames(baseRoot);
DeleteExistingFrames(x2Root);

using var background = LoadBitmap(Path.Combine(assetRoot, "background.png"));
using var errorOverlay = LoadBitmap(Path.Combine(assetRoot, "error.png"));
using var fontCollection = new PrivateFontCollection();
fontCollection.AddFontFile(fontPath);
var fontFamily = fontCollection.Families.FirstOrDefault() ?? throw new InvalidOperationException($"No font families loaded from {fontPath}.");
var baseFontSize = (SystemFonts.MessageBoxFont ?? SystemFonts.DefaultFont).Size;
using var titleFont = new Font(fontFamily, baseFontSize * TitleFontScale, FontStyle.Regular, GraphicsUnit.Point);

var frameCatalog = new Dictionary<string, Bitmap[]>
{
    ["idle"] = LoadFrameSet("idle", "idle"),
    ["idle_thinking"] = LoadFrameSet("idle_thinking", "idle_thinking"),
    ["thinking"] = LoadFrameSet("thinking", "thinking"),
    ["thinking_tool"] = LoadFrameSet("thinking_tool", "thinking_tool"),
    ["tool"] = LoadFrameSet("tool", "tool"),
    ["tool_idle"] = LoadFrameSet("tool_idle", "tool_idle"),
};

var timeline = BuildTimeline();
var totalFrames = timeline.Count;
var manifestFrames = new List<string>(totalFrames);

for (var frameNumber = 1; frameNumber <= totalFrames; frameNumber++)
{
    var framePlan = timeline[frameNumber - 1];
    var spriteFrame = frameCatalog[framePlan.SequenceKey][framePlan.SequenceFrameIndex];
    var hud = framePlan.Hud;
    var outputName = $"frame_{frameNumber:0000}.png";
    var basePath = Path.Combine(baseRoot, outputName);
    var x2Path = Path.Combine(x2Root, outputName);

    using var bitmap = new Bitmap(FrameWidth, FrameHeight, PixelFormat.Format32bppArgb);
    using (var graphics = Graphics.FromImage(bitmap))
    {
        graphics.Clear(Color.Transparent);
        graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
        graphics.SmoothingMode = SmoothingMode.None;
        graphics.PixelOffsetMode = PixelOffsetMode.Half;
        graphics.CompositingQuality = CompositingQuality.HighSpeed;

        var satelliteRect = new Rectangle(0, TitleBarHeight, SatelliteSize, SatelliteSize);
        graphics.DrawImage(background, satelliteRect);
        graphics.DrawImage(spriteFrame, satelliteRect);
        DrawTitleBar(graphics, titleFont);
        DrawHud(graphics, titleFont, hud, satelliteRect);

        if (hud.ErrorActive)
        {
            graphics.DrawImage(errorOverlay, satelliteRect);
        }
    }

    bitmap.Save(basePath, ImageFormat.Png);
    using var upscaled = UpscaleNearest(bitmap, X2Scale);
    upscaled.Save(x2Path, ImageFormat.Png);
    manifestFrames.Add($"render/output/x2/{outputName}");
}

var manifest = new Manifest(UiFps, totalFrames, FrameWidth * X2Scale, FrameHeight * X2Scale, manifestFrames);
var manifestPath = Path.Combine(outputRoot, "manifest.json");
File.WriteAllText(manifestPath, JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true }));

foreach (var set in frameCatalog.Values)
{
    foreach (var frame in set)
    {
        frame.Dispose();
    }
}

return;

string FindRepoRoot(string startDirectory)
{
    var current = new DirectoryInfo(startDirectory);
    while (current is not null)
    {
        var satPath = Path.Combine(current.FullName, "assets", "sat");
        if (Directory.Exists(satPath))
        {
            return current.FullName;
        }

        current = current.Parent;
    }

    throw new DirectoryNotFoundException("Could not locate repo root containing assets\\sat.");
}

void DeleteExistingFrames(string directory)
{
    foreach (var file in Directory.EnumerateFiles(directory, "frame_*.png"))
    {
        File.Delete(file);
    }
}

Bitmap LoadBitmap(string path)
{
    using var source = Image.FromFile(path);
    return new Bitmap(source);
}

Bitmap[] LoadFrameSet(string folder, string prefix)
{
    var result = new Bitmap[8];
    for (var index = 0; index < result.Length; index++)
    {
        result[index] = LoadBitmap(Path.Combine(assetRoot, folder, $"{prefix}_{index:00}.png"));
    }

    return result;
}

List<FramePlan> BuildTimeline()
{
    var plans = new List<FramePlan>(256);
    const int latchedIdleFrames = 32;
    const int idleThinkingFrames = 8;
    const int thinkingFrames = 24;
    const int editingFrames = 16;
    const int awaitingApprovalFrames = 8;
    const int thinkingToolFrames = 8;
    const int toolFrames = 32;
    const int doneHoldFrames = 24;
    const int doneCloseFrames = 8;

    var finalTelemetry = new TelemetrySnapshot(4, 2, 0, "00:16");

    AppendFrames(plans, "idle", "IDLE", latchedIdleFrames, _ => CreateHud("IDLE", finalTelemetry));

    var thinkingLikeFrame = 0;
    var toolFrame = 0;
    var activeFrame = 0;

    AppendFrames(plans, "idle_thinking", "THINKING", idleThinkingFrames, _ =>
    {
        var hud = CreateThinkingHud("THINKING", thinkingLikeFrame, activeFrame);
        thinkingLikeFrame++;
        activeFrame++;
        return hud;
    });

    AppendFrames(plans, "thinking", "THINKING", thinkingFrames, _ =>
    {
        var hud = CreateThinkingHud("THINKING", thinkingLikeFrame, activeFrame);
        thinkingLikeFrame++;
        activeFrame++;
        return hud;
    });

    AppendFrames(plans, "thinking", "EDITING", editingFrames, _ =>
    {
        var hud = CreateThinkingHud("EDITING", thinkingLikeFrame, activeFrame);
        thinkingLikeFrame++;
        activeFrame++;
        return hud;
    });

    AppendFrames(plans, "thinking", "AWAITING_APPROVAL", awaitingApprovalFrames, _ =>
    {
        var hud = CreateThinkingHud("AWAITING_APPROVAL", thinkingLikeFrame, activeFrame);
        thinkingLikeFrame++;
        activeFrame++;
        return hud;
    });

    AppendFrames(plans, "thinking_tool", "TOOL_RUNNING", thinkingToolFrames, _ =>
    {
        var hud = CreateToolHud("TOOL_RUNNING", toolFrame, activeFrame);
        toolFrame++;
        activeFrame++;
        return hud;
    });

    AppendFrames(plans, "tool", "TOOL_RUNNING", toolFrames, _ =>
    {
        var hud = CreateToolHud("TOOL_RUNNING", toolFrame, activeFrame);
        toolFrame++;
        activeFrame++;
        return hud;
    });

    var doneFrozenTelemetry = new TelemetrySnapshot(4, 2, 0, FormatElapsedSeconds(activeFrame / UiFps));
    AppendFrames(plans, "tool", "DONE", doneHoldFrames, _ => CreateHud("DONE", doneFrozenTelemetry));
    AppendFrames(plans, "tool_idle", "DONE", doneCloseFrames, _ => CreateHud("DONE", doneFrozenTelemetry));
    AppendFrames(plans, "idle", "IDLE", latchedIdleFrames, _ => CreateHud("IDLE", doneFrozenTelemetry));

    return plans;
}

void AppendFrames(List<FramePlan> plans, string sequenceKey, string rawState, int frames, Func<int, HudState> hudFactory)
{
    for (var index = 0; index < frames; index++)
    {
        plans.Add(new FramePlan(sequenceKey, index % 8, hudFactory(index)));
    }
}

HudState CreateThinkingHud(string rawState, int thinkingLikeFrame, int activeFrame)
{
    var telemetry = new TelemetrySnapshot(
        RampCount(thinkingLikeFrame, 56, 4),
        0,
        0,
        FormatElapsedSeconds((activeFrame + 1) / UiFps));

    return CreateHud(rawState, telemetry);
}

HudState CreateToolHud(string rawState, int toolFrame, int activeFrame)
{
    var telemetry = new TelemetrySnapshot(
        4,
        RampCount(toolFrame, 40, 2),
        0,
        FormatElapsedSeconds((activeFrame + 1) / UiFps));

    return CreateHud(rawState, telemetry);
}

HudState CreateHud(string rawState, TelemetrySnapshot telemetry)
{
    return new HudState(rawState, telemetry.ThinkCount, telemetry.ToolCount, telemetry.ErrorCount, telemetry.TimeText, false);
}

int RampCount(int localFrame, int totalFrames, int maxCount)
{
    if (maxCount <= 0 || totalFrames <= 0)
    {
        return 0;
    }

    var stepped = (int)Math.Floor(((localFrame + 1d) * (maxCount + 1d)) / totalFrames);
    return Math.Min(maxCount, Math.Max(0, stepped));
}

string FormatElapsedSeconds(int totalSeconds)
{
    totalSeconds = Math.Max(0, totalSeconds);
    var minutes = totalSeconds / 60;
    var seconds = totalSeconds % 60;
    return $"{minutes:00}:{seconds:00}";
}

void DrawTitleBar(Graphics graphics, Font font)
{
    var titleRect = new Rectangle(0, 0, FrameWidth, TitleBarHeight);
    var closeRect = new Rectangle(FrameWidth - CloseButtonSize - TitleBarPadding, (TitleBarHeight - CloseButtonSize) / 2, CloseButtonSize, CloseButtonSize);
    var minimizeRect = new Rectangle(closeRect.Left - CloseButtonSize - TitleBarButtonGap, closeRect.Top, CloseButtonSize, CloseButtonSize);
    var pinRect = new Rectangle(minimizeRect.Left - CloseButtonSize - TitleBarButtonGap, closeRect.Top, CloseButtonSize, CloseButtonSize);

    using var titleBrush = new SolidBrush(Color.FromArgb(0, 122, 204));
    using var shadowBrush = new SolidBrush(Color.FromArgb(180, 0, 0, 0));
    using var textBrush = new SolidBrush(Color.FromArgb(240, 255, 255, 255));
    using var iconPen = new Pen(Color.FromArgb(240, 255, 255, 255), 2);
    graphics.FillRectangle(titleBrush, titleRect);

    var buttonsWidth = (CloseButtonSize * 3) + (TitleBarButtonGap * 2);
    var labelWidth = FrameWidth - (TitleBarPadding * 2) - buttonsWidth;
    var labelRect = new RectangleF(TitleBarPadding, 0, labelWidth, TitleBarHeight);
    var shadowRect = new RectangleF(labelRect.X + 1, labelRect.Y + 1, labelRect.Width, labelRect.Height);
    using var format = new StringFormat { Alignment = StringAlignment.Near, LineAlignment = StringAlignment.Center };
    graphics.DrawString("CoPet", font, shadowBrush, shadowRect, format);
    graphics.DrawString("CoPet", font, textBrush, labelRect, format);

    using var pinBrush = new SolidBrush(Color.FromArgb(115, 0, 96, 180));
    using var minBrush = new SolidBrush(Color.FromArgb(80, 0, 0, 0));
    using var closeBrush = new SolidBrush(Color.FromArgb(80, 0, 0, 0));
    graphics.FillRectangle(pinBrush, pinRect);
    graphics.FillRectangle(minBrush, minimizeRect);
    graphics.FillRectangle(closeBrush, closeRect);

    DrawPinIcon(graphics, iconPen, pinRect);
    var inset = 4;
    var minimizeY = minimizeRect.Bottom - inset - 1;
    graphics.DrawLine(iconPen, minimizeRect.Left + inset, minimizeY, minimizeRect.Right - inset, minimizeY);
    graphics.DrawLine(iconPen, closeRect.Left + inset, closeRect.Top + inset, closeRect.Right - inset, closeRect.Bottom - inset);
    graphics.DrawLine(iconPen, closeRect.Left + inset, closeRect.Bottom - inset, closeRect.Right - inset, closeRect.Top + inset);
}

void DrawPinIcon(Graphics graphics, Pen pen, Rectangle rect)
{
    var centerX = rect.Left + (rect.Width / 2);
    var headY = rect.Top + 4;
    graphics.DrawEllipse(pen, centerX - 3, headY, 6, 6);
    graphics.DrawLine(pen, centerX, headY + 6, centerX, rect.Bottom - 5);
    graphics.DrawLine(pen, centerX - 2, rect.Bottom - 8, centerX + 2, rect.Bottom - 8);
    graphics.DrawLine(pen, centerX, rect.Bottom - 8, centerX, rect.Bottom - 3);
}

void DrawHud(Graphics graphics, Font font, HudState hud, Rectangle satelliteRect)
{
    using var hudBrush = new SolidBrush(Color.FromArgb(240, 255, 255, 255));
    using var shadowBrush = new SolidBrush(Color.FromArgb(180, 0, 0, 0));
    using var formatRight = new StringFormat { Alignment = StringAlignment.Far, LineAlignment = StringAlignment.Near };

    var topLeft = new PointF(satelliteRect.Left + HudPadding, satelliteRect.Top + HudPadding);
    graphics.DrawString(hud.RawState, font, shadowBrush, topLeft.X + 1, topLeft.Y + 1);
    graphics.DrawString(hud.RawState, font, hudBrush, topLeft);

    var lines = new[]
    {
        $"THINK {hud.ThinkCount}",
        $"TOOL  {hud.ToolCount}",
        $"ERR   {hud.ErrorCount}",
    };

    var rightX = satelliteRect.Right - HudPadding;
    var y = satelliteRect.Top + HudPadding;
    foreach (var line in lines)
    {
        var shadowPoint = new PointF(rightX + 1, y + 1);
        var point = new PointF(rightX, y);
        graphics.DrawString(line, font, shadowBrush, shadowPoint, formatRight);
        graphics.DrawString(line, font, hudBrush, point, formatRight);
        y += font.Height + 2;
    }

    var bottomLeft = new PointF(satelliteRect.Left + HudPadding, satelliteRect.Bottom - HudPadding - font.Height);
    var timeLine = $"TIME {hud.TimeText}";
    graphics.DrawString(timeLine, font, shadowBrush, bottomLeft.X + 1, bottomLeft.Y + 1);
    graphics.DrawString(timeLine, font, hudBrush, bottomLeft);
}

Bitmap UpscaleNearest(Bitmap input, int scale)
{
    var output = new Bitmap(input.Width * scale, input.Height * scale, PixelFormat.Format32bppArgb);
    using var graphics = Graphics.FromImage(output);
    graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
    graphics.SmoothingMode = SmoothingMode.None;
    graphics.PixelOffsetMode = PixelOffsetMode.Half;
    graphics.CompositingQuality = CompositingQuality.HighSpeed;
    graphics.DrawImage(input, new Rectangle(0, 0, output.Width, output.Height));
    return output;
}

internal sealed record FramePlan(string SequenceKey, int SequenceFrameIndex, HudState Hud);
internal sealed record HudState(string RawState, int ThinkCount, int ToolCount, int ErrorCount, string TimeText, bool ErrorActive);
internal sealed record TelemetrySnapshot(int ThinkCount, int ToolCount, int ErrorCount, string TimeText);
internal sealed record Manifest(int Fps, int FrameCount, int Width, int Height, IReadOnlyList<string> Frames);
