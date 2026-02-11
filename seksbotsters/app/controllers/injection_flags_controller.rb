# typed: false

class InjectionFlagsController < ApplicationController
  before_action :require_logged_in_user

  def index
    @flags = InjectionFlag.pending.includes(:flagger, :flaggable).order(created_at: :desc)
  end

  def create
    flaggable = find_flaggable
    if flaggable.nil?
      flash[:error] = "Content not found."
      redirect_back(fallback_location: root_path) && return
    end

    existing = InjectionFlag.find_by(user_id: @user.id, flaggable: flaggable)
    if existing
      flash[:notice] = "You have already flagged this content."
      redirect_back(fallback_location: root_path) && return
    end

    flag = InjectionFlag.new(
      flagger: @user,
      flaggable: flaggable,
      reason: params[:reason]
    )

    if flag.save
      flaggable.increment!(:injection_flag_count)
      flaggable.update!(injection_hidden: true) if flaggable.injection_flag_count >= 1
      flash[:success] = "Content flagged for review."
    else
      flash[:error] = "Could not create flag."
    end

    redirect_back(fallback_location: root_path)
  end

  private

  def find_flaggable
    case params[:flaggable_type]
    when "Story"
      Story.find_by(short_id: params[:flaggable_id])
    when "Comment"
      Comment.find_by(short_id: params[:flaggable_id])
    end
  end
end
